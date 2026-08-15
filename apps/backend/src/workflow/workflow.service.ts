import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { StudyStatus, type UserRole } from '@radiology/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuditEventType } from '../audit/audit.types';
import {
  InvalidStateTransitionException,
  NotFoundAppException,
} from '../common/errors/app.exception';
import { AppLogger } from '../common/logging/app-logger.service';
import { isTransitionAllowed, TRANSITION_TIMESTAMP_FIELD } from './workflow.transitions';

/** Who caused a transition. Integration-driven events have no user. */
export interface WorkflowContext {
  actorUserId?: string;
  actorRole?: UserRole;
  reason?: string;
  metadata?: Record<string, unknown>;
  /**
   * Extra Study columns to write in the same transaction as the transition.
   *
   * Unchecked input so callers can set foreign keys such as
   * `assignedDoctorId` directly; `status` in here is always overridden by the
   * validated target.
   */
  studyData?: Prisma.StudyUncheckedUpdateInput;
}

export interface TransitionResult {
  studyId: string;
  fromStatus: StudyStatus;
  toStatus: StudyStatus;
}

/**
 * The one place a Study status changes (CLAUDE.md sections 11 and 12).
 *
 * No other service writes `study.status` directly; they call this and let it
 * validate the transition, write the history row and the audit entry in a
 * single transaction (WORKFLOW_STATE_MACHINE section 43).
 *
 * Authorization (role, hospital scope, lock ownership) belongs to the calling
 * action service, which knows what the action is. This service owns the part
 * every caller must not be able to skip: is the transition legal at all, and is
 * it recorded.
 */
@Injectable()
export class WorkflowService {
  private readonly logger: AppLogger;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    logger: AppLogger,
  ) {
    this.logger = logger.child(WorkflowService.name);
  }

  /**
   * Moves a study to `targetStatus`.
   *
   * Runs inside the supplied transaction when one is given, so a caller can
   * make the transition atomic with its own writes (a report version, an HBYS
   * delivery row). Without one it opens its own.
   */
  async transition(
    studyId: string,
    targetStatus: StudyStatus,
    context: WorkflowContext = {},
    tx?: Prisma.TransactionClient,
  ): Promise<TransitionResult> {
    if (tx) {
      return this.applyTransition(tx, studyId, targetStatus, context);
    }

    return this.prisma.$transaction((transaction) =>
      this.applyTransition(transaction, studyId, targetStatus, context),
    );
  }

  private async applyTransition(
    tx: Prisma.TransactionClient,
    studyId: string,
    targetStatus: StudyStatus,
    context: WorkflowContext,
  ): Promise<TransitionResult> {
    const study = await tx.study.findUnique({
      where: { id: studyId },
      select: { id: true, status: true, hospitalId: true, patientId: true },
    });

    if (!study) {
      throw new NotFoundAppException('Study not found.');
    }

    const fromStatus = study.status as StudyStatus;

    if (!isTransitionAllowed(fromStatus, targetStatus)) {
      this.logger.warn({
        message: 'Invalid transition rejected',
        studyId,
        fromStatus,
        targetStatus,
        actorUserId: context.actorUserId,
      });
      throw new InvalidStateTransitionException(fromStatus, targetStatus);
    }

    const timestampField = TRANSITION_TIMESTAMP_FIELD[targetStatus];
    const changedAt = new Date();

    const data: Prisma.StudyUncheckedUpdateInput = {
      ...context.studyData,
      status: targetStatus,
      ...(timestampField ? { [timestampField]: changedAt } : {}),
    };

    await tx.study.update({ where: { id: studyId }, data });

    await tx.studyStatusHistory.create({
      data: {
        studyId,
        fromStatus,
        toStatus: targetStatus,
        actorUserId: context.actorUserId,
        actorRole: context.actorRole,
        reason: context.reason,
        metadata: (context.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });

    await this.audit.record(
      {
        eventType: AuditEventType.STUDY_STATUS_CHANGED,
        actor: { userId: context.actorUserId, role: context.actorRole },
        hospitalId: study.hospitalId,
        patientId: study.patientId,
        studyId,
        entityType: 'Study',
        entityId: studyId,
        metadata: { fromStatus, toStatus: targetStatus, reason: context.reason },
      },
      tx,
    );

    this.logger.info({
      message: 'Study status changed',
      studyId,
      fromStatus,
      toStatus: targetStatus,
      actorUserId: context.actorUserId,
    });

    return { studyId, fromStatus, toStatus: targetStatus };
  }
}
