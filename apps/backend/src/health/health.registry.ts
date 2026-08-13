import { Injectable } from '@nestjs/common';
import type { HealthIndicator } from './health.types';

/**
 * Collects dependency health indicators.
 *
 * Nest has no multi-provider concept, so infrastructure modules register
 * themselves here during `onModuleInit` instead.
 */
@Injectable()
export class HealthRegistry {
  private readonly indicators = new Map<string, HealthIndicator>();

  register(indicator: HealthIndicator): void {
    this.indicators.set(indicator.name, indicator);
  }

  list(): HealthIndicator[] {
    return [...this.indicators.values()];
  }
}
