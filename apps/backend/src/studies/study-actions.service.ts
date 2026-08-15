import { Injectable } from '@nestjs/common';
import { StudyStatus, UserRole } from '@radiology/shared';
import { PrismaService } from '../prisma/prisma.service';
import { WorkflowService } from '../workflow/workflow.service';
import { StudyLockService } from '../locks/study-lock.service';
import { AuditService } from '../audit/audit.service';
import { AuditEventType } from '../audit/audit.types';
import { HospitalScopeService } from '../auth/hospital-scope.service';
import {
  ForbiddenAppException,
  InvalidStateTransitionException,
  NotFoundAppException,
} from '../common/errors/app.exception';
import { AppLogger } from '../common/logging/app-logger.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { StudyLockInfo } from '../locks/lock.types';

export interface StartReadingResult {
  studyId: string;
  status: StudyStatus;
  lock: {
    ownerUserId: string;
    ownerRole: UserRole;
    lockedAt: string;
    heartbeatIntervalSeconds: number;
  };
  readingStartedAt: string;
}

/**
 * Doctor workflow actions (TASK_QUEUE BACKEND-016, BACKEND-017).
 *
 * Each action performs the full check list before mutating anything:
 * authentication, role, hospital scope, workflow state and lock ownership
 * (docs/AUTH_ROLES_PERMISSIONS.md section 1).
 */
@Injectable()
export class StudyActionsService {
  private readonly logger: AppLogger;

  constructor(
    private readonly prisma: PrismaService,
    private readonly workflow: WorkflowService,
    private readonly locks: StudyLockService,
    private readonly audit: AuditService,
    private readonly hospitalScope: HospitalScopeService,
    logger: AppLogger,
  ) {
    this.logger = logger.child(StudyActionsService.name);
  }

  /**
   * `POST /studies/:id/start-reading` (docs/API_CONTRACT.md sections 30-32).
   *
   * The lock is taken before the transition, so two doctors racing on the same
   * study cannot both reach the state change; the loser gets 423. If the
   * transition then fails, the lock is released again — Redis is outside the
   * database transaction and needs explicit compensation
   * (docs/WORKFLOW_STATE_MACHINE.md section 43).
   */
  async startReading(user: AuthenticatedUser, studyId: string): Promise<StartReadingResult> {
    const study = await this.loadStudyInScope(user, studyId);

    // The lock is checked before the workflow state, in the order
    // API_CONTRACT section 30 lays out. It matters: once doctor A is reading,
    // the status is no longer UNREAD, and checking state first would tell
    // doctor B "wrong state" instead of "someone else has it".
    const { lock, alreadyOwned } = await this.locks.acquire(studyId, {
      userId: user.id,
      displayName: await this.displayNameFor(user.id),
      role: user.role,
    });

    try {
      if (study.status !== StudyStatus.UNREAD) {
        throw new InvalidStateTransitionException(study.status, StudyStatus.READING);
      }

      const readingStartedAt = new Date();

      await this.prisma.$transaction(async (tx) => {
        await this.audit.record(
          {
            eventType: AuditEventType.STUDY_READING_STARTED,
            actor: { userId: user.id, role: user.role },
            hospitalId: study.hospitalId,
            patientId: study.patientId,
            studyId,
            entityType: 'Study',
            entityId: studyId,
            metadata: { lockedAt: lock.lockedAt },
          },
          tx,
        );

        await tx.studyAssignment.create({
          data: { studyId, userId: user.id, type: 'DOCTOR', assignedBy: user.id },
        });

        await this.workflow.transition(
          studyId,
          StudyStatus.READING,
          {
            actorUserId: user.id,
            actorRole: user.role,
            reason: 'Doctor started reading',
            studyData: { assignedDoctorId: user.id },
          },
          tx,
        );
      });

      this.logger.info({ message: 'Reading started', studyId, doctorId: user.id });

      return {
        studyId,
        status: StudyStatus.READING,
        lock: {
          ownerUserId: lock.ownerUserId,
          ownerRole: lock.ownerRole,
          lockedAt: lock.lockedAt,
          heartbeatIntervalSeconds: this.locks.heartbeatSeconds,
        },
        readingStartedAt: readingStartedAt.toISOString(),
      };
    } catch (error) {
      // Leaving a lock behind would block the study for a full TTL after a
      // failure that changed nothing — but only release what this call took.
      // The caller may already have been reading the study, and dropping that
      // lock would hand their study to someone else.
      if (!alreadyOwned) {
        await this.locks.release(studyId, user.id).catch(() => undefined);
      }
      throw error;
    }
  }

  /** `POST /studies/:id/lock/heartbeat` — owner only. */
  async heartbeat(
    user: AuthenticatedUser,
    studyId: string,
  ): Promise<{ valid: true; expiresInSeconds: number }> {
    await this.loadStudyInScope(user, studyId);

    const { expiresInSeconds } = await this.locks.heartbeat(studyId, user.id);

    return { valid: true, expiresInSeconds };
  }

  /** `POST /studies/:id/lock/release` — owner only. */
  async releaseLock(user: AuthenticatedUser, studyId: string): Promise<{ released: boolean }> {
    const study = await this.loadStudyInScope(user, studyId);

    const released = await this.locks.release(studyId, user.id);

    if (released) {
      // The study status is deliberately left as it is: releasing the working
      // screen does not undo clinical progress (API_CONTRACT section 34).
      await this.audit.record({
        eventType: AuditEventType.STUDY_LOCK_RELEASED,
        actor: { userId: user.id, role: user.role },
        hospitalId: study.hospitalId,
        patientId: study.patientId,
        studyId,
        entityType: 'Study',
        entityId: studyId,
      });
    }

    return { released };
  }

  /**
   * `POST /studies/:id/lock/force-release` — OPERATION or MANAGER only.
   *
   * Exceptional recovery, not the normal takeover path: the reason is
   * mandatory and the previous owner is recorded (CLAUDE.md section 18).
   */
  async forceReleaseLock(
    user: AuthenticatedUser,
    studyId: string,
    reason: string,
  ): Promise<{ released: boolean; previousOwnerUserId: string | null }> {
    const study = await this.loadStudyInScope(user, studyId);

    if (user.role !== UserRole.OPERATION && user.role !== UserRole.MANAGER) {
      throw new ForbiddenAppException('Only Operation or Manager may force release a lock.');
    }

    const previous = await this.locks.forceRelease(studyId);

    await this.audit.record({
      eventType: AuditEventType.STUDY_LOCK_FORCE_RELEASED,
      actor: { userId: user.id, role: user.role },
      hospitalId: study.hospitalId,
      patientId: study.patientId,
      studyId,
      entityType: 'Study',
      entityId: studyId,
      metadata: {
        reason,
        previousOwnerUserId: previous?.ownerUserId ?? null,
        previousOwnerRole: previous?.ownerRole ?? null,
        lockedAt: previous?.lockedAt ?? null,
      },
    });

    this.logger.warn({
      message: 'Study lock force released',
      studyId,
      by: user.id,
      previousOwnerUserId: previous?.ownerUserId ?? null,
    });

    return { released: previous !== null, previousOwnerUserId: previous?.ownerUserId ?? null };
  }

  /** `GET /studies/:id/lock` — current lock state. */
  async getLock(user: AuthenticatedUser, studyId: string): Promise<StudyLockInfo> {
    await this.loadStudyInScope(user, studyId);
    return this.locks.describe(studyId);
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

  private async displayNameFor(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });

    return user ? `${user.firstName} ${user.lastName}`.trim() : '';
  }
}
