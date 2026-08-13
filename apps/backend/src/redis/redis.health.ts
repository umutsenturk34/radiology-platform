import { Injectable } from '@nestjs/common';
import type { HealthIndicator, HealthIndicatorResult } from '../health/health.types';
import { RedisService } from './redis.service';

@Injectable()
export class RedisHealthIndicator implements HealthIndicator {
  readonly name = 'redis';

  constructor(private readonly redis: RedisService) {}

  async check(): Promise<HealthIndicatorResult> {
    try {
      const startedAt = Date.now();
      const alive = await this.redis.ping();
      return alive
        ? { status: 'up', details: { latencyMs: Date.now() - startedAt } }
        : { status: 'down' };
    } catch {
      return { status: 'down' };
    }
  }
}
