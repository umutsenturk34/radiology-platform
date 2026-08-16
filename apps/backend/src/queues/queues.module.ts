import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { RedisService } from '../redis/redis.service';
import { AppLogger } from '../common/logging/app-logger.service';
import { HBYS_DELIVERY_QUEUE, HBYS_QUEUE } from './queue.constants';
import type { HbysConfig } from '../config/configuration';

/**
 * BullMQ foundation (TASK_QUEUE BACKEND-033).
 *
 * The queue gets its own Redis connection: BullMQ issues blocking commands,
 * and sharing the application client would stall the study locks.
 *
 * Job options encode the pilot retry policy — one attempt per configured delay
 * (docs/INTEGRATIONS.md section 39). The delay for each attempt comes from the
 * worker's backoff strategy, so the schedule stays the documented 30s / 2m / 5m
 * rather than an exponential curve nobody chose.
 */
@Global()
@Module({
  providers: [
    {
      provide: HBYS_QUEUE,
      useFactory: (redis: RedisService, config: ConfigService, logger: AppLogger): Queue => {
        const hbys = config.get<HbysConfig>('app.hbys');
        // One initial attempt plus one per configured retry delay.
        const attempts = (hbys?.retryDelaysMs.length ?? 3) + 1;

        const queue = new Queue(HBYS_DELIVERY_QUEUE, {
          connection: redis.createConnection('bullmq-queue'),
          defaultJobOptions: {
            attempts,
            backoff: { type: 'pilot' },
            // Bounded history only. The durable record of what happened is the
            // HbysDeliveryAttempt rows in PostgreSQL, never the job.
            removeOnComplete: 100,
            removeOnFail: 500,
          },
        });

        logger.child('QueuesModule').info({
          message: 'Queue registered',
          queue: HBYS_DELIVERY_QUEUE,
          attempts,
        });

        return queue;
      },
      inject: [RedisService, ConfigService, AppLogger],
    },
  ],
  exports: [HBYS_QUEUE],
})
export class QueuesModule {}
