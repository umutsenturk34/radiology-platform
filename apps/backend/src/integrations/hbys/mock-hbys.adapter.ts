import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';
import { AppLogger } from '../../common/logging/app-logger.service';
import type {
  HbysAdapter,
  HbysDeliveryResult,
  NormalizedHbysReport,
} from '../contracts/hbys.contract';
import type { HbysConfig } from '../../config/configuration';

/** Pilot mock behaviours (docs/INTEGRATIONS.md sections 45-48). */
export const MockHbysMode = {
  SUCCESS: 'SUCCESS',
  FAIL: 'FAIL',
  TIMEOUT: 'TIMEOUT',
} as const;

export type MockHbysMode = (typeof MockHbysMode)[keyof typeof MockHbysMode];

export const MOCK_HBYS_MODES: readonly MockHbysMode[] = Object.values(MockHbysMode);

/**
 * The mode lives in Redis rather than in memory so it is shared by every
 * request and by the queue worker, and so a mode set through dev tools still
 * applies to a job picked up moments later.
 */
const MODE_KEY = 'devtools:hbys:mode';

/**
 * Pilot HBYS adapter (TASK_QUEUE BACKEND-036).
 *
 * Each mode is deterministic — no randomness — so the failure and retry paths
 * can be tested repeatably (CLAUDE.md section 27).
 */
@Injectable()
export class MockHbysAdapter implements HbysAdapter {
  readonly name = 'MockHbysAdapter';

  private readonly logger: AppLogger;
  private readonly config: HbysConfig;
  /** Used when Redis cannot be reached, so dev tools never hard-fail. */
  private fallbackMode: MockHbysMode = MockHbysMode.SUCCESS;

  constructor(
    private readonly redis: RedisService,
    config: ConfigService,
    logger: AppLogger,
  ) {
    this.logger = logger.child(MockHbysAdapter.name);
    this.config = config.get<HbysConfig>('app.hbys') ?? {
      retryDelaysMs: [30_000, 120_000, 300_000],
      mockTimeoutDelayMs: 1_000,
    };
  }

  async getMode(): Promise<MockHbysMode> {
    try {
      const stored = await this.redis.getClient().get(MODE_KEY);
      if (stored && (MOCK_HBYS_MODES as readonly string[]).includes(stored)) {
        return stored as MockHbysMode;
      }
    } catch {
      this.logger.warn({ message: 'Could not read the mock HBYS mode from Redis' });
    }

    return this.fallbackMode;
  }

  async setMode(mode: MockHbysMode): Promise<MockHbysMode> {
    this.fallbackMode = mode;

    try {
      await this.redis.getClient().set(MODE_KEY, mode);
    } catch {
      this.logger.warn({ message: 'Could not persist the mock HBYS mode to Redis' });
    }

    this.logger.info({ message: 'Mock HBYS mode changed', mode });
    return mode;
  }

  async sendReport(input: NormalizedHbysReport): Promise<HbysDeliveryResult> {
    const mode = await this.getMode();

    this.logger.debug({
      message: 'Mock HBYS send',
      mode,
      // The report content is never logged (CLAUDE.md section 42).
      idempotencyKey: input.idempotencyKey,
      accessionNumber: input.study.accessionNumber,
    });

    if (mode === MockHbysMode.FAIL) {
      return {
        success: false,
        // A rejection is a permanent decision by the remote system; retrying
        // it would just repeat the rejection (INTEGRATIONS section 40).
        retryable: false,
        errorCode: 'MOCK_HBYS_REJECTED',
        message: 'Mock HBYS rejection.',
        httpStatus: 422,
      };
    }

    if (mode === MockHbysMode.TIMEOUT) {
      await delay(this.config.mockTimeoutDelayMs);
      return {
        success: false,
        retryable: true,
        errorCode: 'MOCK_HBYS_TIMEOUT',
        message: 'Mock HBYS timeout.',
      };
    }

    return {
      success: true,
      // Derived from the idempotency key, so the same delivery always reports
      // the same external id.
      externalReportId: `MOCK-HBYS-${input.idempotencyKey.slice(0, 12).toUpperCase()}`,
    };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
