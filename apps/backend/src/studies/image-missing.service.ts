import { Injectable } from '@nestjs/common';
import { StudyStatus, UserRole } from '@radiology/shared';
import { PrismaService } from '../prisma/prisma.service';
import { WorkflowService } from '../workflow/workflow.service';
import { LockNotOwnedException, StudyLockService } from '../locks/study-lock.service';
import { AuditService } from '../audit/audit.service';
import { AuditEventType } from '../audit/audit.types';
import { HospitalScopeService } from '../auth/hospital-scope.service';
import { RealtimeService } from '../realtime/realtime.service';
import {
  ForbiddenAppException,
  InvalidStateTransitionException,
  NotFoundAppException,
} from '../common/errors/app.exception';
import { AppLogger } from '../common/logging/app-logger.service';
import type { AuthenticatedUser } from '../auth/auth.types';

export interface MarkImageMissingResult {
  studyId: string;
  status: StudyStatus;
  incidentId: string;
  lockReleased: boolean;
}

export interface ResolveImageMissingResult {
  studyId: string;
  status: StudyStatus;
}

/**
 * IMAGE_MISSING reporting and resolution (TASK_QUEUE BACKEND-042,
 * WORKFLOW_STATE_MACHINE section 20).
 *
 * The doctor parks a study they cannot read; operations chase the images and
 * send it back to UNREAD for a fresh evaluation. The reason lives in an
 * `ImageMissingIncident`, one row per report, so a second report on the same
 * study does not overwrite the first.
 */
@Injectable()
export class ImageMissingService {
  private readonly logger: AppLogger;

  constructor(
    private readonly prisma: PrismaService,
    private readonly workflow: WorkflowService,
    private readonly locks: StudyLockService,
    private readonly audit: AuditService,
    private readonly hospitalScope: HospitalScopeService,
    private readonly realtime: RealtimeService,
    logger: AppLogger,
  ) {
    this.logger = logger.child(ImageMissingService.name);
  }

  /**
   * `POST /studies/:id/image-missing` (docs/API_CONTRACT.md section 46).
   *
   * Only the doctor who holds the reading lock may report: the report is a
   * clinical judgement about what that doctor is looking at. The lock is
   * released after the commit, as it is in complete-reading — releasing first
   * would hand a still-READING study to someone else if the commit failed.
   */
  async markImageMissing(
    user: AuthenticatedUser,
    studyId: string,
    reason: string,
  ): Promise<MarkImageMissingResult> {
    const study = await this.loadStudyInScope(user, studyId);

    if (study.status !== StudyStatus.READING) {
      throw new InvalidStateTransitionException(study.status, StudyStatus.IMAGE_MISSING);
    }

    const lock = await this.locks.getLock(studyId);
    if (!lock || lock.ownerUserId !== user.id) {
      throw new LockNotOwnedException({ studyId });
    }

    const reportedAt = new Date();

    const incident = await this.prisma.$transaction(async (tx) => {
      const created = await tx.imageMissingIncident.create({
        data: { studyId, reportedBy: user.id, reason, reportedAt },
      });

      await tx.studyAssignment.updateMany({
        where: { studyId, userId: user.id, type: 'DOCTOR', releasedAt: null },
        data: { releasedAt: reportedAt },
      });

      // The doctor assignment is cleared: the study returns to the pool and
      // any doctor may take the fresh evaluation (WORKFLOW_STATE_MACHINE
      // section 20).
      await this.workflow.transition(
        studyId,
        StudyStatus.IMAGE_MISSING,
        {
          actorUserId: user.id,
          actorRole: user.role,
          reason,
          metadata: { incidentId: created.id },
          studyData: { assignedDoctorId: null },
        },
        tx,
      );

      await this.audit.record(
        {
          eventType: AuditEventType.IMAGE_MISSING_REPORTED,
          actor: { userId: user.id, role: user.role },
          hospitalId: study.hospitalId,
          patientId: study.patientId,
          studyId,
          entityType: 'ImageMissingIncident',
          entityId: created.id,
          // The reason is clinical free text; the incident row is where it is
          // kept, the audit trail only points at it.
          metadata: { incidentId: created.id },
        },
        tx,
      );

      return created;
    });

    const lockReleased = await this.locks.release(studyId, user.id).catch(() => false);

    const context = { studyId, hospitalId: study.hospitalId, actor: { userId: user.id, role: user.role } }; // prettier-ignore
    this.realtime.emitStudyStatusChanged(context, {
      fromStatus: StudyStatus.READING,
      toStatus: StudyStatus.IMAGE_MISSING,
    });
    this.realtime.emitStudyImageMissing(context, {
      incidentId: incident.id,
      reportedByUserId: user.id,
      reportedAt: reportedAt.toISOString(),
    });
    if (lockReleased) {
      this.realtime.emitStudyUnlocked(context, {
        previousOwnerUserId: user.id,
        previousOwnerRole: user.role,
        reason: 'WORKFLOW_COMPLETED',
      });
    }

    this.logger.info({
      message: 'Study marked image missing',
      studyId,
      incidentId: incident.id,
      doctorId: user.id,
    });

    return { studyId, status: StudyStatus.IMAGE_MISSING, incidentId: incident.id, lockReleased };
  }

  /**
   * `POST /studies/:id/image-missing/resolve` (docs/API_CONTRACT.md section 47).
   *
   * Operation or Manager, after the images are confirmed complete. The study
   * goes back to UNREAD for a new evaluation (WORKFLOW_STATE_MACHINE
   * section 20); the incident is closed in the same transaction.
   */
  async resolveImageMissing(
    user: AuthenticatedUser,
    studyId: string,
    resolutionNote?: string,
  ): Promise<ResolveImageMissingResult> {
    if (user.role !== UserRole.OPERATION && user.role !== UserRole.MANAGER) {
      throw new ForbiddenAppException('Only Operation or Manager may resolve an image missing.');
    }

    const study = await this.loadStudyInScope(user, studyId);

    if (study.status !== StudyStatus.IMAGE_MISSING) {
      throw new InvalidStateTransitionException(study.status, StudyStatus.UNREAD);
    }

    const resolvedAt = new Date();

    const incident = await this.prisma.$transaction(async (tx) => {
      const open = await tx.imageMissingIncident.findFirst({
        where: { studyId, status: 'OPEN' },
        orderBy: { reportedAt: 'desc' },
      });

      // A study in IMAGE_MISSING without an open incident means the two
      // records disagree. Guessing would hide that, so refuse.
      if (!open) {
        throw new InvalidStateTransitionException(study.status, StudyStatus.UNREAD);
      }

      const closed = await tx.imageMissingIncident.update({
        where: { id: open.id },
        data: {
          status: 'RESOLVED',
          resolvedAt,
          resolvedBy: user.id,
          resolutionNote: resolutionNote ?? null,
        },
      });

      await this.workflow.transition(
        studyId,
        StudyStatus.UNREAD,
        {
          actorUserId: user.id,
          actorRole: user.role,
          reason: resolutionNote ?? 'Image missing resolved',
          metadata: { incidentId: closed.id },
        },
        tx,
      );

      await this.audit.record(
        {
          eventType: AuditEventType.IMAGE_MISSING_RESOLVED,
          actor: { userId: user.id, role: user.role },
          hospitalId: study.hospitalId,
          patientId: study.patientId,
          studyId,
          entityType: 'ImageMissingIncident',
          entityId: closed.id,
          metadata: { incidentId: closed.id },
        },
        tx,
      );

      return closed;
    });

    const context = { studyId, hospitalId: study.hospitalId, actor: { userId: user.id, role: user.role } }; // prettier-ignore
    this.realtime.emitStudyStatusChanged(context, {
      fromStatus: StudyStatus.IMAGE_MISSING,
      toStatus: StudyStatus.UNREAD,
    });
    this.realtime.emitStudyImageMissingResolved(context, {
      incidentId: incident.id,
      resolvedByUserId: user.id,
      resolvedAt: resolvedAt.toISOString(),
    });

    this.logger.info({
      message: 'Image missing resolved',
      studyId,
      incidentId: incident.id,
      by: user.id,
    });

    return { studyId, status: StudyStatus.UNREAD };
  }

  private async loadStudyInScope(user: AuthenticatedUser, studyId: string) {
    const study = await this.prisma.study.findUnique({
      where: { id: studyId },
      select: { id: true, hospitalId: true, patientId: true, status: true },
    });

    if (!study) {
      throw new NotFoundAppException('Study not found.');
    }

    this.hospitalScope.assertAllowed(user, study.hospitalId);

    return { ...study, status: study.status as StudyStatus };
  }
}
