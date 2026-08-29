import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import {
  ApiErrorCode,
  HbysDeliveryStatus,
  StudyStatus,
  type HbysDeliveryAttemptDto,
  type HbysDeliveryDto,
} from '@radiology/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkflowService } from '../../workflow/workflow.service';
import { AuditService } from '../../audit/audit.service';
import { AuditEventType } from '../../audit/audit.types';
import { HospitalScopeService } from '../../auth/hospital-scope.service';
import { RealtimeService } from '../../realtime/realtime.service';
import { AppException, NotFoundAppException } from '../../common/errors/app.exception';
import { AppLogger } from '../../common/logging/app-logger.service';
import { HBYS_ADAPTER, type HbysAdapter } from '../contracts/hbys.contract';
import { HBYS_DELIVERY_JOB, HBYS_QUEUE, type HbysDeliveryJobData } from '../../queues/queue.constants'; // prettier-ignore
import type { AuthenticatedUser } from '../../auth/auth.types';
import type { HbysConfig } from '../../config/configuration';

/** 409 — this delivery is not in a state a manual retry can act on. */
export class HbysNotRetryableException extends AppException {
  constructor(currentStatus: string) {
    super(
      ApiErrorCode.HBYS_NOT_RETRYABLE,
      'This delivery cannot be retried in its current state.',
      HttpStatus.CONFLICT,
      { currentStatus },
    );
  }
}

/**
 * HBYS delivery orchestration (TASK_QUEUE BACKEND-037, BACKEND-038).
 *
 * Delivery is asynchronous: finalization queues a job and returns, and the
 * study reaches HBYS_SENT or HBYS_FAILED later
 * (docs/INTEGRATIONS.md section 35). A failure is never hidden — after the
 * automatic retries are exhausted the study sits in HBYS_FAILED where
 * operations can see it (CLAUDE.md section 25).
 */
@Injectable()
export class HbysDeliveryService {
  private readonly logger: AppLogger;
  private readonly config: HbysConfig;

  constructor(
    private readonly prisma: PrismaService,
    private readonly workflow: WorkflowService,
    private readonly audit: AuditService,
    private readonly hospitalScope: HospitalScopeService,
    @Inject(HBYS_ADAPTER) private readonly adapter: HbysAdapter,
    @Inject(HBYS_QUEUE) private readonly queue: Queue,
    private readonly realtime: RealtimeService,
    config: ConfigService,
    logger: AppLogger,
  ) {
    this.logger = logger.child(HbysDeliveryService.name);
    this.config = config.get<HbysConfig>('app.hbys') ?? {
      retryDelaysMs: [30_000, 120_000, 300_000],
      mockTimeoutDelayMs: 1_000,
    };
  }

  /** Total attempts allowed before a delivery is considered failed. */
  get maxAttempts(): number {
    return this.config.retryDelaysMs.length + 1;
  }

  /**
   * Queues a delivery.
   *
   * The job id is left to BullMQ. Pinning it to the delivery id looks like
   * useful de-duplication but silently drops a manual retry: the completed job
   * from the first attempt is still in the queue's history, so a job with the
   * same id is ignored and the retry never runs. Double processing is prevented
   * by `claim()` instead, which is atomic in the database.
   */
  async enqueue(deliveryId: string): Promise<void> {
    await this.queue.add(HBYS_DELIVERY_JOB, { deliveryId } satisfies HbysDeliveryJobData);

    this.logger.info({ message: 'HBYS delivery queued', deliveryId });
  }

  /**
   * Processes one delivery attempt.
   *
   * `jobAttempt` is the queue's attempt counter and decides only whether
   * another automatic retry is due; it restarts at 1 for a manually retried
   * delivery, which is what gives a manual retry a fresh budget. The attempt
   * number written to the database comes from the delivery's own counter, so it
   * never collides with an earlier attempt row.
   *
   * Returns whether the job should be retried. The worker throws on a retryable
   * failure so BullMQ schedules the next attempt; a permanent failure or an
   * exhausted budget is a completed job with a FAILED delivery.
   */
  async processDelivery(deliveryId: string, jobAttempt: number): Promise<{ retry: boolean }> {
    const claimed = await this.claim(deliveryId);

    if (!claimed) {
      // Already sent, or being processed elsewhere. Doing nothing is what keeps
      // a report from being delivered twice.
      this.logger.warn({ message: 'HBYS delivery not claimable; skipping', deliveryId });
      return { retry: false };
    }

    const delivery = await this.loadDeliveryForSend(deliveryId);
    const attemptNumber = delivery.attemptCount + 1;
    const budgetLeft = jobAttempt < this.maxAttempts;

    try {
      const startedAt = new Date();

      const result = await this.adapter.sendReport({
        hospitalId: delivery.hospitalId,
        patient: { externalPatientId: delivery.study.patient.externalPatientId },
        study: { accessionNumber: delivery.study.accessionNumber },
        report: {
          versionId: delivery.reportVersionId,
          content: delivery.reportVersion.content,
          finalizedAt: (delivery.reportVersion.finalizedAt ?? startedAt).toISOString(),
          finalizedByDoctorId: delivery.reportVersion.createdBy,
        },
        idempotencyKey: delivery.idempotencyKey,
      });

      const completedAt = new Date();

      if (result.success) {
        await this.recordSuccess(delivery, attemptNumber, startedAt, completedAt, result.externalReportId); // prettier-ignore
        return { retry: false };
      }

      const willRetry = result.retryable && budgetLeft;

      await this.recordFailure(delivery, {
        attemptNumber,
        startedAt,
        completedAt,
        errorCode: result.errorCode,
        errorMessage: result.message,
        httpStatus: result.httpStatus,
        willRetry,
      });

      return { retry: willRetry };
    } catch (error) {
      // Something other than a delivery result went wrong — a database error,
      // for instance. Without this the delivery would stay PROCESSING forever:
      // nothing can claim it again and a manual retry only accepts FAILED, so
      // the study would sit in HBYS_PENDING with no way out. That is exactly
      // the hidden failure CLAUDE.md section 25 forbids.
      await this.releaseClaim(delivery, error, budgetLeft);
      throw error;
    }
  }

  /**
   * `POST /hbys-deliveries/:id/retry` — OPERATION or MANAGER
   * (TASK_QUEUE BACKEND-038).
   *
   * Previous attempts are kept: a retry adds to the history rather than
   * replacing it, and the report version is unchanged (CLAUDE.md section 25).
   */
  async manualRetry(
    user: AuthenticatedUser,
    deliveryId: string,
    reason: string,
  ): Promise<HbysDeliveryDto> {
    const delivery = await this.prisma.hbysDelivery.findUnique({ where: { id: deliveryId } });

    if (!delivery) {
      throw new NotFoundAppException('HBYS delivery not found.');
    }

    this.hospitalScope.assertAllowed(user, delivery.hospitalId);

    if (delivery.status !== HbysDeliveryStatus.FAILED) {
      // Retrying a sent delivery would duplicate the report at the hospital.
      throw new HbysNotRetryableException(delivery.status);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.hbysDelivery.update({
        where: { id: deliveryId },
        data: { status: HbysDeliveryStatus.PENDING, completedAt: null },
      });

      await this.audit.record(
        {
          eventType: AuditEventType.HBYS_MANUAL_RETRY,
          actor: { userId: user.id, role: user.role },
          hospitalId: delivery.hospitalId,
          studyId: delivery.studyId,
          entityType: 'HbysDelivery',
          entityId: deliveryId,
          metadata: {
            reason,
            previousAttemptCount: delivery.attemptCount,
            previousErrorCode: delivery.lastErrorCode,
          },
        },
        tx,
      );

      await this.workflow.transition(
        delivery.studyId,
        StudyStatus.HBYS_PENDING,
        { actorUserId: user.id, actorRole: user.role, reason: `Manual HBYS retry: ${reason}` },
        tx,
      );

      return row;
    });

    await this.enqueue(deliveryId);

    this.realtime.emitStudyStatusChanged(
      {
        studyId: delivery.studyId,
        hospitalId: delivery.hospitalId,
        actor: { userId: user.id, role: user.role },
      },
      { fromStatus: StudyStatus.HBYS_FAILED, toStatus: StudyStatus.HBYS_PENDING },
    );
    this.realtime.emitHbysDeliveryPending(
      {
        studyId: delivery.studyId,
        hospitalId: delivery.hospitalId,
        actor: { userId: user.id, role: user.role },
      },
      {
        deliveryId,
        reportVersionId: delivery.reportVersionId,
        queuedAt: new Date().toISOString(),
      },
    );

    this.logger.info({ message: 'HBYS delivery manually retried', deliveryId, by: user.id });

    return toDeliveryDto(updated);
  }

  /** `GET /studies/:id/hbys-deliveries` (docs/API_CONTRACT.md section 64). */
  async listForStudy(user: AuthenticatedUser, studyId: string): Promise<HbysDeliveryDto[]> {
    const study = await this.prisma.study.findUnique({
      where: { id: studyId },
      select: { hospitalId: true },
    });

    if (!study) {
      throw new NotFoundAppException('Study not found.');
    }

    this.hospitalScope.assertAllowed(user, study.hospitalId);

    const deliveries = await this.prisma.hbysDelivery.findMany({
      where: { studyId },
      orderBy: { queuedAt: 'desc' },
    });

    return deliveries.map(toDeliveryDto);
  }

  /**
   * `GET /hbys-deliveries/:id/attempts` — OPERATION or MANAGER
   * (docs/API_CONTRACT.md section 65).
   *
   * Metadata only: the response carries no report content
   * (docs/API_CONTRACT.md section 105).
   */
  async listAttempts(user: AuthenticatedUser, deliveryId: string): Promise<HbysDeliveryAttemptDto[]> {
    const delivery = await this.prisma.hbysDelivery.findUnique({ where: { id: deliveryId } });

    if (!delivery) {
      throw new NotFoundAppException('HBYS delivery not found.');
    }

    this.hospitalScope.assertAllowed(user, delivery.hospitalId);

    const attempts = await this.prisma.hbysDeliveryAttempt.findMany({
      where: { deliveryId },
      orderBy: { attemptNumber: 'asc' },
    });

    return attempts.map((attempt) => ({
      id: attempt.id,
      attemptNumber: attempt.attemptNumber,
      status: attempt.status as HbysDeliveryStatus,
      httpStatus: attempt.httpStatus,
      errorCode: attempt.errorCode,
      errorMessage: attempt.errorMessage,
      startedAt: attempt.startedAt.toISOString(),
      completedAt: attempt.completedAt?.toISOString() ?? null,
    }));
  }

  /**
   * Atomically moves a delivery into PROCESSING.
   *
   * A conditional update rather than read-then-write: two workers picking up
   * the same delivery must not both send it.
   */
  private async claim(deliveryId: string): Promise<boolean> {
    const result = await this.prisma.hbysDelivery.updateMany({
      where: {
        id: deliveryId,
        status: { in: [HbysDeliveryStatus.PENDING, HbysDeliveryStatus.FAILED] },
      },
      data: { status: HbysDeliveryStatus.PROCESSING },
    });

    return result.count === 1;
  }

  /**
   * Undoes a claim after an unexpected error.
   *
   * Back to PENDING while the job still has attempts left, FAILED once it does
   * not — so the study always ends up either retried or visibly failed, never
   * stuck mid-flight.
   */
  private async releaseClaim(
    delivery: { id: string; studyId: string; hospitalId: string },
    error: unknown,
    budgetLeft: boolean,
  ): Promise<void> {
    const reason = error instanceof Error ? error.message : 'unknown error';

    this.logger.error({
      message: 'HBYS delivery attempt errored; releasing the claim',
      deliveryId: delivery.id,
      budgetLeft,
      reason,
    });

    try {
      if (budgetLeft) {
        await this.prisma.hbysDelivery.update({
          where: { id: delivery.id },
          data: { status: HbysDeliveryStatus.PENDING, lastErrorCode: 'HBYS_PROCESSING_ERROR' },
        });
        return;
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.hbysDelivery.update({
          where: { id: delivery.id },
          data: {
            status: HbysDeliveryStatus.FAILED,
            lastErrorCode: 'HBYS_PROCESSING_ERROR',
            lastErrorMessage: reason,
            completedAt: new Date(),
          },
        });

        await this.audit.record(
          {
            eventType: AuditEventType.HBYS_DELIVERY_FAILED,
            hospitalId: delivery.hospitalId,
            studyId: delivery.studyId,
            entityType: 'HbysDelivery',
            entityId: delivery.id,
            metadata: { errorCode: 'HBYS_PROCESSING_ERROR' },
          },
          tx,
        );

        await this.workflow.transition(
          delivery.studyId,
          StudyStatus.HBYS_FAILED,
          { reason: 'HBYS delivery processing error' },
          tx,
        );
      });
    } catch (releaseError) {
      // Nothing else can be done here; the delivery stays PROCESSING and needs
      // operational attention, which is why it is logged at error level.
      this.logger.error({
        message: 'Could not release the HBYS delivery claim',
        deliveryId: delivery.id,
        reason: releaseError instanceof Error ? releaseError.message : 'unknown error',
      });
    }
  }

  private async loadDeliveryForSend(deliveryId: string) {
    const delivery = await this.prisma.hbysDelivery.findUnique({
      where: { id: deliveryId },
      include: {
        reportVersion: true,
        study: { include: { patient: { select: { externalPatientId: true } } } },
      },
    });

    if (!delivery) {
      throw new NotFoundAppException('HBYS delivery not found.');
    }

    return delivery;
  }

  private async recordSuccess(
    delivery: {
      id: string;
      studyId: string;
      hospitalId: string;
      reportVersionId: string;
      attemptCount: number;
    },
    attemptNumber: number,
    startedAt: Date,
    completedAt: Date,
    externalReportId?: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.hbysDeliveryAttempt.create({
        data: {
          deliveryId: delivery.id,
          attemptNumber,
          status: HbysDeliveryStatus.SENT,
          startedAt,
          completedAt,
        },
      });

      await tx.hbysDelivery.update({
        where: { id: delivery.id },
        data: {
          status: HbysDeliveryStatus.SENT,
          attemptCount: attemptNumber,
          externalReportId,
          sentAt: completedAt,
          completedAt,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      });

      await this.audit.record(
        {
          eventType: AuditEventType.HBYS_DELIVERY_SENT,
          hospitalId: delivery.hospitalId,
          studyId: delivery.studyId,
          entityType: 'HbysDelivery',
          entityId: delivery.id,
          metadata: { attemptNumber, externalReportId },
        },
        tx,
      );

      await this.workflow.transition(
        delivery.studyId,
        StudyStatus.HBYS_SENT,
        { reason: 'HBYS delivery accepted' },
        tx,
      );
    });

    this.realtime.emitHbysDeliverySent(
      { studyId: delivery.studyId, hospitalId: delivery.hospitalId },
      {
        deliveryId: delivery.id,
        reportVersionId: delivery.reportVersionId,
        sentAt: completedAt.toISOString(),
        ...(externalReportId ? { externalReportId } : {}),
      },
    );
    this.realtime.emitStudyStatusChanged(
      { studyId: delivery.studyId, hospitalId: delivery.hospitalId },
      { fromStatus: StudyStatus.HBYS_PENDING, toStatus: StudyStatus.HBYS_SENT },
    );

    this.logger.info({
      message: 'HBYS delivery sent',
      deliveryId: delivery.id,
      attemptNumber,
    });
  }

  private async recordFailure(
    delivery: { id: string; studyId: string; hospitalId: string; reportVersionId: string },
    input: {
      attemptNumber: number;
      startedAt: Date;
      completedAt: Date;
      errorCode: string;
      errorMessage: string;
      httpStatus?: number;
      willRetry: boolean;
    },
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.hbysDeliveryAttempt.create({
        data: {
          deliveryId: delivery.id,
          attemptNumber: input.attemptNumber,
          status: HbysDeliveryStatus.FAILED,
          startedAt: input.startedAt,
          completedAt: input.completedAt,
          errorCode: input.errorCode,
          errorMessage: input.errorMessage,
          httpStatus: input.httpStatus,
        },
      });

      await tx.hbysDelivery.update({
        where: { id: delivery.id },
        data: {
          // Back to PENDING while retries remain, so the next attempt can claim
          // it; FAILED once the budget is spent.
          status: input.willRetry ? HbysDeliveryStatus.PENDING : HbysDeliveryStatus.FAILED,
          attemptCount: input.attemptNumber,
          lastErrorCode: input.errorCode,
          lastErrorMessage: input.errorMessage,
          completedAt: input.willRetry ? null : input.completedAt,
        },
      });

      if (!input.willRetry) {
        await this.audit.record(
          {
            eventType: AuditEventType.HBYS_DELIVERY_FAILED,
            hospitalId: delivery.hospitalId,
            studyId: delivery.studyId,
            entityType: 'HbysDelivery',
            entityId: delivery.id,
            metadata: {
              attemptNumber: input.attemptNumber,
              errorCode: input.errorCode,
            },
          },
          tx,
        );

        // The study must show the failure; it does not silently stay pending
        // (CLAUDE.md section 25).
        await this.workflow.transition(
          delivery.studyId,
          StudyStatus.HBYS_FAILED,
          { reason: `HBYS delivery failed: ${input.errorCode}` },
          tx,
        );
      }
    });

    // A retryable attempt is not a failure anyone needs to act on yet; the
    // study is still HBYS_PENDING and the queue will try again. Announcing
    // every attempt would train Operation to ignore the alert.
    if (!input.willRetry) {
      this.realtime.emitHbysDeliveryFailed(
        { studyId: delivery.studyId, hospitalId: delivery.hospitalId },
        {
          deliveryId: delivery.id,
          reportVersionId: delivery.reportVersionId,
          failedAt: input.completedAt.toISOString(),
          errorCode: input.errorCode,
          message: input.errorMessage,
          attemptCount: input.attemptNumber,
          retryable: false,
        },
      );
      this.realtime.emitStudyStatusChanged(
        { studyId: delivery.studyId, hospitalId: delivery.hospitalId },
        { fromStatus: StudyStatus.HBYS_PENDING, toStatus: StudyStatus.HBYS_FAILED },
      );
    }

    this.logger[input.willRetry ? 'warn' : 'error']({
      message: input.willRetry ? 'HBYS delivery attempt failed; will retry' : 'HBYS delivery failed',
      deliveryId: delivery.id,
      attemptNumber: input.attemptNumber,
      errorCode: input.errorCode,
    });
  }
}

interface DeliveryRow {
  id: string;
  studyId: string;
  reportVersionId: string;
  status: string;
  attemptCount: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  externalReportId: string | null;
  queuedAt: Date;
  sentAt: Date | null;
  completedAt: Date | null;
}

export function toDeliveryDto(delivery: DeliveryRow): HbysDeliveryDto {
  return {
    id: delivery.id,
    studyId: delivery.studyId,
    reportVersionId: delivery.reportVersionId,
    status: delivery.status as HbysDeliveryStatus,
    attemptCount: delivery.attemptCount,
    lastErrorCode: delivery.lastErrorCode,
    lastErrorMessage: delivery.lastErrorMessage,
    externalReportId: delivery.externalReportId,
    queuedAt: delivery.queuedAt.toISOString(),
    sentAt: delivery.sentAt?.toISOString() ?? null,
    completedAt: delivery.completedAt?.toISOString() ?? null,
  };
}
