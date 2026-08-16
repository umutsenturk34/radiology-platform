import { HttpStatus, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import {
  ApiErrorCode,
  HbysDeliveryStatus,
  ReportSource,
  ReportStatus,
  StudyStatus,
  UserRole,
} from '@radiology/shared';
import { PrismaService } from '../prisma/prisma.service';
import { WorkflowService } from '../workflow/workflow.service';
import { LockNotOwnedException, StudyLockService } from '../locks/study-lock.service';
import { HospitalScopeService } from '../auth/hospital-scope.service';
import { AuditService } from '../audit/audit.service';
import { AuditEventType } from '../audit/audit.types';
import {
  AppException,
  ForbiddenAppException,
  InvalidStateTransitionException,
  NotFoundAppException,
} from '../common/errors/app.exception';
import { AppLogger } from '../common/logging/app-logger.service';
import { EmptyReportException } from './report.errors';
import { toReportDto, type ReportDto } from './reports.service';
import type { AuthenticatedUser } from '../auth/auth.types';

/** 409 — the study has no completed report to approve. */
export class NoCompletedReportException extends AppException {
  constructor() {
    super(
      ApiErrorCode.CONFLICT,
      'This study has no completed report to approve.',
      HttpStatus.CONFLICT,
    );
  }
}

/** 403 — the study belongs to another doctor's approval queue. */
export class NotAssignedDoctorException extends AppException {
  constructor() {
    super(
      ApiErrorCode.STUDY_NOT_ASSIGNED_TO_USER,
      'This study is assigned to another doctor.',
      HttpStatus.FORBIDDEN,
    );
  }
}

export interface StartApprovalResult {
  studyId: string;
  status: StudyStatus;
  report: ReportDto;
  lock: {
    ownerUserId: string;
    ownerRole: UserRole;
    lockedAt: string;
    heartbeatIntervalSeconds: number;
  };
}

export interface FinalizeResult {
  studyId: string;
  status: StudyStatus;
  report: { status: ReportStatus; versionId: string; finalizedAt: string };
  hbysDelivery: { id: string; status: HbysDeliveryStatus };
}

/**
 * Doctor approval and finalization
 * (TASK_QUEUE BACKEND-030, BACKEND-031, BACKEND-032).
 *
 * Medical final approval belongs to the assigned doctor and to nobody else:
 * a reporter cannot finalize, an operation user cannot finalize, and a manager
 * does not gain clinical authority by being a manager
 * (CLAUDE.md sections 22 and 62).
 */
@Injectable()
export class ApprovalService {
  private readonly logger: AppLogger;

  constructor(
    private readonly prisma: PrismaService,
    private readonly workflow: WorkflowService,
    private readonly locks: StudyLockService,
    private readonly hospitalScope: HospitalScopeService,
    private readonly audit: AuditService,
    logger: AppLogger,
  ) {
    this.logger = logger.child(ApprovalService.name);
  }

  /**
   * `POST /studies/:id/start-approval` (docs/API_CONTRACT.md section 58).
   *
   * Takes the approval lock. The study status deliberately stays
   * WAITING_APPROVAL: approval is not a separate workflow state
   * (docs/WORKFLOW_STATE_MACHINE.md section 15).
   */
  async startApproval(user: AuthenticatedUser, studyId: string): Promise<StartApprovalResult> {
    const study = await this.loadStudyInScope(user, studyId);

    const { lock, alreadyOwned } = await this.locks.acquire(studyId, {
      userId: user.id,
      displayName: await this.displayNameFor(user.id),
      role: user.role,
    });

    try {
      this.assertApprovable(user, study);

      await this.audit.record({
        eventType: AuditEventType.APPROVAL_STARTED,
        actor: { userId: user.id, role: user.role },
        hospitalId: study.hospitalId,
        patientId: study.patientId,
        studyId,
        entityType: 'Study',
        entityId: studyId,
      });

      this.logger.info({ message: 'Approval started', studyId, doctorId: user.id });

      return {
        studyId,
        status: StudyStatus.WAITING_APPROVAL,
        report: await this.loadReportDto(studyId),
        lock: {
          ownerUserId: lock.ownerUserId,
          ownerRole: lock.ownerRole,
          lockedAt: lock.lockedAt,
          heartbeatIntervalSeconds: this.locks.heartbeatSeconds,
        },
      };
    } catch (error) {
      if (!alreadyOwned) {
        await this.locks.release(studyId, user.id).catch(() => undefined);
      }
      throw error;
    }
  }

  /**
   * `PUT /studies/:id/report/approval-draft` (docs/API_CONTRACT.md section 59).
   *
   * The doctor corrects the reporter's text before finalizing. The correction
   * is written into a new version rather than over the reporter's completed
   * one, so who wrote what stays visible (CLAUDE.md section 21).
   */
  async saveApprovalDraft(
    user: AuthenticatedUser,
    studyId: string,
    content: string,
  ): Promise<{ reportId: string; versionId: string; versionNumber: number; savedAt: string }> {
    const study = await this.loadStudyInScope(user, studyId);
    this.assertApprovable(user, study);
    await this.assertLockOwner(studyId, user.id);

    const { report, version } = await this.loadCurrentVersion(studyId);
    const savedAt = new Date();

    // While the doctor already owns a draft of their own, keep editing it;
    // otherwise branch a new version off the reporter's completed one.
    const editable =
      version.status === ReportStatus.DRAFT && version.createdBy === user.id ? version : null;

    const result = await this.prisma.$transaction(async (tx) => {
      if (editable) {
        await tx.reportVersion.update({ where: { id: editable.id }, data: { content } });
        return { id: editable.id, versionNumber: editable.versionNumber };
      }

      const created = await tx.reportVersion.create({
        data: {
          reportId: report.id,
          versionNumber: version.versionNumber + 1,
          content,
          source: ReportSource.MANUAL,
          status: ReportStatus.DRAFT,
          createdBy: user.id,
          supersedesVersionId: version.id,
        },
      });

      await tx.report.update({
        where: { id: report.id },
        data: { currentVersionId: created.id },
      });

      await this.audit.record(
        {
          eventType: AuditEventType.REPORT_EDITED_DURING_APPROVAL,
          actor: { userId: user.id, role: user.role },
          hospitalId: study.hospitalId,
          patientId: study.patientId,
          studyId,
          entityType: 'ReportVersion',
          entityId: created.id,
          metadata: {
            supersedesVersionId: version.id,
            versionNumber: created.versionNumber,
            contentLength: content.length,
          },
        },
        tx,
      );

      return { id: created.id, versionNumber: created.versionNumber };
    });

    return {
      reportId: report.id,
      versionId: result.id,
      versionNumber: result.versionNumber,
      savedAt: savedAt.toISOString(),
    };
  }

  /**
   * `POST /studies/:id/return-to-reporter` (TASK_QUEUE BACKEND-031).
   *
   * The other outcome of approval. The reason is mandatory: the reporter has to
   * know what to change.
   */
  async returnToReporter(
    user: AuthenticatedUser,
    studyId: string,
    reason: string,
  ): Promise<{ studyId: string; status: StudyStatus; lockReleased: boolean }> {
    const study = await this.loadStudyInScope(user, studyId);
    this.assertApprovable(user, study);
    await this.assertLockOwner(studyId, user.id);

    await this.prisma.$transaction(async (tx) => {
      await this.audit.record(
        {
          eventType: AuditEventType.REPORT_RETURNED_TO_REPORTER,
          actor: { userId: user.id, role: user.role },
          hospitalId: study.hospitalId,
          patientId: study.patientId,
          studyId,
          entityType: 'Study',
          entityId: studyId,
          metadata: { reason },
        },
        tx,
      );

      await this.workflow.transition(
        studyId,
        StudyStatus.WAITING_TRANSCRIPTION,
        { actorUserId: user.id, actorRole: user.role, reason },
        tx,
      );
    });

    const lockReleased = await this.locks.release(studyId, user.id).catch(() => false);

    this.logger.info({ message: 'Report returned to reporter', studyId, doctorId: user.id });

    return { studyId, status: StudyStatus.WAITING_TRANSCRIPTION, lockReleased };
  }

  /**
   * `POST /studies/:id/finalize` (docs/API_CONTRACT.md sections 61-63).
   *
   * Marks the report version FINAL, moves the study to FINAL and then straight
   * to HBYS_PENDING with a delivery row. The HBYS send itself is asynchronous:
   * finalize returning success never means the report reached the hospital
   * (docs/INTEGRATIONS.md section 35).
   */
  async finalize(
    user: AuthenticatedUser,
    studyId: string,
    content?: string,
  ): Promise<FinalizeResult> {
    const study = await this.loadStudyInScope(user, studyId);
    this.assertApprovable(user, study);
    await this.assertLockOwner(studyId, user.id);

    const { report, version } = await this.loadCurrentVersion(studyId);

    if (version.status === ReportStatus.FINAL) {
      // Finalizing twice would create a second delivery for the same report.
      throw new InvalidStateTransitionException(study.status, StudyStatus.FINAL);
    }

    const finalContent = content ?? version.content;
    if (finalContent.trim().length === 0) {
      throw new EmptyReportException();
    }

    const finalizedAt = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      // Approving the text as-is finalizes that version. Changing it at
      // finalize time creates a new version instead, so the reporter's
      // completed text is never overwritten (CLAUDE.md section 21).
      const finalVersion =
        finalContent === version.content
          ? await tx.reportVersion.update({
              where: { id: version.id },
              data: { status: ReportStatus.FINAL, finalizedAt },
            })
          : await tx.reportVersion.create({
              data: {
                reportId: report.id,
                versionNumber: version.versionNumber + 1,
                content: finalContent,
                source: ReportSource.MANUAL,
                status: ReportStatus.FINAL,
                createdBy: user.id,
                supersedesVersionId: version.id,
                completedAt: finalizedAt,
                finalizedAt,
              },
            });

      if (finalVersion.id !== version.id) {
        await tx.reportVersion.update({
          where: { id: version.id },
          data: { status: ReportStatus.SUPERSEDED },
        });
      }

      await tx.report.update({
        where: { id: report.id },
        data: {
          status: ReportStatus.FINAL,
          currentVersionId: finalVersion.id,
          finalizedAt,
        },
      });

      await this.audit.record(
        {
          eventType: AuditEventType.REPORT_FINALIZED,
          actor: { userId: user.id, role: user.role },
          hospitalId: study.hospitalId,
          patientId: study.patientId,
          studyId,
          entityType: 'ReportVersion',
          entityId: finalVersion.id,
          metadata: {
            versionNumber: finalVersion.versionNumber,
            contentLength: finalContent.length,
          },
        },
        tx,
      );

      await this.workflow.transition(
        studyId,
        StudyStatus.FINAL,
        {
          actorUserId: user.id,
          actorRole: user.role,
          reason: 'Doctor final approval',
        },
        tx,
      );

      const delivery = await this.createDelivery(tx, {
        studyId,
        hospitalId: study.hospitalId,
        reportVersionId: finalVersion.id,
      });

      await this.audit.record(
        {
          eventType: AuditEventType.HBYS_DELIVERY_QUEUED,
          actor: { userId: user.id, role: user.role },
          hospitalId: study.hospitalId,
          patientId: study.patientId,
          studyId,
          entityType: 'HbysDelivery',
          entityId: delivery.id,
          metadata: { reportVersionId: finalVersion.id },
        },
        tx,
      );

      // Delivery is created and the study moves to HBYS_PENDING in the same
      // transaction as the finalization, so a finalized report can never exist
      // without a delivery to send it (CLAUDE.md section 23).
      await this.workflow.transition(
        studyId,
        StudyStatus.HBYS_PENDING,
        { reason: 'HBYS delivery queued' },
        tx,
      );

      return { finalVersion, delivery };
    });

    await this.locks.release(studyId, user.id).catch(() => undefined);

    this.logger.info({
      message: 'Report finalized',
      studyId,
      doctorId: user.id,
      deliveryId: result.delivery.id,
    });

    return {
      studyId,
      status: StudyStatus.HBYS_PENDING,
      report: {
        status: ReportStatus.FINAL,
        versionId: result.finalVersion.id,
        finalizedAt: finalizedAt.toISOString(),
      },
      hbysDelivery: {
        id: result.delivery.id,
        status: result.delivery.status as HbysDeliveryStatus,
      },
    };
  }

  /**
   * Creates the delivery row, or returns the existing one.
   *
   * The idempotency key is deterministic on the finalized report version, so a
   * retried finalize cannot produce a second logical delivery
   * (docs/INTEGRATIONS.md section 42, CLAUDE.md section 26).
   */
  private async createDelivery(
    tx: Prisma.TransactionClient,
    input: { studyId: string; hospitalId: string; reportVersionId: string },
  ) {
    const idempotencyKey = buildIdempotencyKey(input.studyId, input.reportVersionId);

    const existing = await tx.hbysDelivery.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;

    return tx.hbysDelivery.create({
      data: {
        studyId: input.studyId,
        hospitalId: input.hospitalId,
        reportVersionId: input.reportVersionId,
        idempotencyKey,
        status: HbysDeliveryStatus.PENDING,
      },
    });
  }

  /**
   * The checks shared by every approval action.
   *
   * Role alone is never enough: the study must be in the approval state and
   * assigned to this doctor (docs/AUTH_ROLES_PERMISSIONS.md sections 13 and 14).
   */
  private assertApprovable(
    user: AuthenticatedUser,
    study: { status: StudyStatus; assignedDoctorId: string | null },
  ): void {
    if (user.role !== UserRole.DOCTOR) {
      throw new ForbiddenAppException('Only a doctor may approve a report.');
    }

    if (study.status !== StudyStatus.WAITING_APPROVAL) {
      throw new InvalidStateTransitionException(study.status, StudyStatus.FINAL);
    }

    if (study.assignedDoctorId && study.assignedDoctorId !== user.id) {
      throw new NotAssignedDoctorException();
    }
  }

  private async loadCurrentVersion(studyId: string) {
    const report = await this.prisma.report.findUnique({
      where: { studyId },
      include: { currentVersion: true },
    });

    if (!report?.currentVersion) {
      throw new NoCompletedReportException();
    }

    return { report, version: report.currentVersion };
  }

  private async loadReportDto(studyId: string): Promise<ReportDto> {
    const report = await this.prisma.report.findUnique({
      where: { studyId },
      include: { currentVersion: { include: { author: AUTHOR_SELECT } } },
    });

    if (!report) {
      throw new NoCompletedReportException();
    }

    return toReportDto(report);
  }

  private async loadStudyInScope(user: AuthenticatedUser, studyId: string) {
    const study = await this.prisma.study.findUnique({
      where: { id: studyId },
      select: {
        id: true,
        hospitalId: true,
        patientId: true,
        status: true,
        assignedDoctorId: true,
      },
    });

    if (!study) {
      throw new NotFoundAppException('Study not found.');
    }

    this.hospitalScope.assertAllowed(user, study.hospitalId);

    return { ...study, status: study.status as StudyStatus };
  }

  private async assertLockOwner(studyId: string, userId: string): Promise<void> {
    const lock = await this.locks.getLock(studyId);

    if (!lock || lock.ownerUserId !== userId) {
      throw new LockNotOwnedException({ studyId });
    }
  }

  private async displayNameFor(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });

    return user ? `${user.firstName} ${user.lastName}`.trim() : '';
  }
}

const AUTHOR_SELECT = { select: { id: true, firstName: true, lastName: true } } as const;

/** Deterministic on study + finalized version (DATA_MODEL.md section 58). */
export function buildIdempotencyKey(studyId: string, reportVersionId: string): string {
  return createHash('sha256').update(`${studyId}:${reportVersionId}`).digest('hex');
}
