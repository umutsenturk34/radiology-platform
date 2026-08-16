import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, type Job } from 'bullmq';
import { RedisService } from '../../redis/redis.service';
import { AppLogger } from '../../common/logging/app-logger.service';
import { HbysDeliveryService } from './hbys-delivery.service';
import { HBYS_DELIVERY_QUEUE, type HbysDeliveryJobData } from '../../queues/queue.constants';
import type { HbysConfig } from '../../config/configuration';

/** Thrown to tell BullMQ to schedule another attempt. */
class RetryableDeliveryError extends Error {
  constructor(deliveryId: string) {
    super(`HBYS delivery ${deliveryId} failed and will be retried.`);
    this.name = 'RetryableDeliveryError';
  }
}

/**
 * HBYS delivery worker (TASK_QUEUE BACKEND-037).
 *
 * Runs in the application process, which is adequate for the pilot; moving it
 * to its own process later means instantiating this worker there instead, with
 * no change to the service it calls.
 *
 * The retry schedule is the documented one (30s, 2m, 5m) rather than an
 * exponential curve, supplied through a named backoff strategy.
 */
@Injectable()
export class HbysDeliveryWorker implements OnModuleInit, OnApplicationShutdown {
  private readonly logger: AppLogger;
  private readonly config: HbysConfig;
  private worker: Worker | null = null;

  constructor(
    private readonly redis: RedisService,
    private readonly deliveries: HbysDeliveryService,
    config: ConfigService,
    logger: AppLogger,
  ) {
    this.logger = logger.child(HbysDeliveryWorker.name);
    this.config = config.get<HbysConfig>('app.hbys') ?? {
      retryDelaysMs: [30_000, 120_000, 300_000],
      mockTimeoutDelayMs: 1_000,
    };
  }

  onModuleInit(): void {
    this.worker = new Worker<HbysDeliveryJobData>(
      HBYS_DELIVERY_QUEUE,
      async (job) => this.handle(job),
      {
        connection: this.redis.createConnection('bullmq-worker'),
        // One at a time: the pilot has a single hospital endpoint, and serial
        // delivery keeps the ordering easy to reason about.
        concurrency: 1,
        settings: {
          backoffStrategy: (attemptsMade: number) =>
            this.config.retryDelaysMs[attemptsMade - 1] ??
            this.config.retryDelaysMs[this.config.retryDelaysMs.length - 1] ??
            30_000,
        },
      },
    );

    this.worker.on('failed', (job, error) => {
      this.logger.warn({
        message: 'HBYS delivery job attempt failed',
        jobId: job?.id,
        attemptsMade: job?.attemptsMade,
        reason: error.message,
      });
    });

    this.logger.info({ message: 'HBYS delivery worker started', queue: HBYS_DELIVERY_QUEUE });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    this.worker = null;
  }

  private async handle(job: Job<HbysDeliveryJobData>): Promise<void> {
    // BullMQ counts attempts from zero before the handler runs. This is the
    // job's attempt, used only to decide whether another automatic retry is
    // due; the attempt number stored against the delivery is its own counter.
    const jobAttempt = job.attemptsMade + 1;

    const { retry } = await this.deliveries.processDelivery(job.data.deliveryId, jobAttempt);

    if (retry) {
      // The delivery row already records this attempt; throwing is only how the
      // next one gets scheduled.
      throw new RetryableDeliveryError(job.data.deliveryId);
    }
  }
}
