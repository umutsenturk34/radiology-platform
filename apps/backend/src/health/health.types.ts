/**
 * Extension point for dependency health.
 *
 * Infrastructure modules (Prisma, Redis, object storage, queues) register an
 * indicator so `GET /api/v1/health` can report their real state instead of a
 * hard-coded value.
 */
export const HEALTH_INDICATOR = Symbol('HEALTH_INDICATOR');

export type DependencyStatus = 'up' | 'down';

export interface HealthIndicatorResult {
  status: DependencyStatus;
  details?: Record<string, unknown>;
}

export interface HealthIndicator {
  readonly name: string;
  check(): Promise<HealthIndicatorResult>;
}

export type OverallHealthStatus = 'ok' | 'degraded';

export interface HealthReport {
  status: OverallHealthStatus;
  appEnv: string;
  version: string;
  uptimeSeconds: number;
  timestamp: string;
  dependencies: Record<string, HealthIndicatorResult>;
}
