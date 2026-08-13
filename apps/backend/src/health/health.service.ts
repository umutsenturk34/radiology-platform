import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from '../common/logging/app-logger.service';
import {
  HEALTH_INDICATOR,
  type HealthIndicator,
  type HealthIndicatorResult,
  type HealthReport,
} from './health.types';

/** A hung dependency must not hang the health endpoint. */
const INDICATOR_TIMEOUT_MS = 3000;

@Injectable()
export class HealthService {
  private readonly logger: AppLogger;

  constructor(
    private readonly config: ConfigService,
    logger: AppLogger,
    @Optional()
    @Inject(HEALTH_INDICATOR)
    private readonly indicators: HealthIndicator[] = [],
  ) {
    this.logger = logger.child(HealthService.name);
  }

  async check(): Promise<HealthReport> {
    const dependencies: Record<string, HealthIndicatorResult> = {};

    const results = await Promise.all(
      (this.indicators ?? []).map(async (indicator) => ({
        name: indicator.name,
        result: await this.runIndicator(indicator),
      })),
    );

    for (const { name, result } of results) {
      dependencies[name] = result;
    }

    const anyDown = Object.values(dependencies).some((entry) => entry.status === 'down');

    return {
      status: anyDown ? 'degraded' : 'ok',
      appEnv: this.config.get<string>('app.appEnv') ?? 'local',
      version: process.env.npm_package_version ?? '0.1.0',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      dependencies,
    };
  }

  private async runIndicator(indicator: HealthIndicator): Promise<HealthIndicatorResult> {
    try {
      return await withTimeout(indicator.check(), INDICATOR_TIMEOUT_MS);
    } catch (error) {
      this.logger.warn({
        message: 'Health indicator failed',
        indicator: indicator.name,
        reason: error instanceof Error ? error.message : 'unknown error',
      });
      return { status: 'down' };
    }
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`Health check timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
