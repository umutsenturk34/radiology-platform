import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { AppLogger } from '../common/logging/app-logger.service';
import type { DatabaseConfig } from '../config/configuration';

/**
 * PostgreSQL access. PostgreSQL is the persistent source of truth for all
 * clinical and business state (CLAUDE.md section 14).
 *
 * The connection is verified at startup so misconfiguration surfaces as a
 * clear boot failure rather than a confusing error on the first request
 * (docs/BACKEND.md section 16).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger: AppLogger;

  constructor(logger: AppLogger, config?: ConfigService) {
    const database = config?.get<DatabaseConfig>('app.database');

    super({
      // Query text is safe to log at debug level; parameters are not, because
      // they contain patient and report data (CLAUDE.md section 42).
      log: [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
      // Prisma's 5s default is too short when the database is reached through
      // a TCP proxy: a workflow transition plus its history and audit rows is
      // several round trips, and exceeding the limit aborts the whole
      // transaction (docs/WORKFLOW_STATE_MACHINE.md section 43).
      transactionOptions: {
        timeout: database?.transactionTimeoutMs ?? 15_000,
        maxWait: database?.transactionMaxWaitMs ?? 10_000,
      },
    });
    this.logger = logger.child(PrismaService.name);
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.info({ message: 'Database connection established' });
    } catch (error) {
      // Do not include the connection string: it carries credentials.
      this.logger.error({
        message: 'Database connection failed',
        reason: error instanceof Error ? error.message : 'unknown error',
      });
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Lightweight liveness probe used by the health endpoint. */
  async ping(): Promise<boolean> {
    await this.$queryRaw`SELECT 1`;
    return true;
  }
}
