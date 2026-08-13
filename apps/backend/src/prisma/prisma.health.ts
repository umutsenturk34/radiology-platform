import { Injectable } from '@nestjs/common';
import type { HealthIndicator, HealthIndicatorResult } from '../health/health.types';
import { PrismaService } from './prisma.service';

@Injectable()
export class PrismaHealthIndicator implements HealthIndicator {
  readonly name = 'database';

  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthIndicatorResult> {
    try {
      const startedAt = Date.now();
      await this.prisma.ping();
      return { status: 'up', details: { latencyMs: Date.now() - startedAt } };
    } catch {
      // The reason is deliberately omitted: it can contain host and credential
      // fragments, and /health is unauthenticated.
      return { status: 'down' };
    }
  }
}
