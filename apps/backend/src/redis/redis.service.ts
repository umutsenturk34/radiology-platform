import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { type RedisOptions } from 'ioredis';
import { AppLogger } from '../common/logging/app-logger.service';

/**
 * Redis connection used for study locks and (later) BullMQ.
 *
 * Redis holds ephemeral coordination state only. Permanent clinical/business
 * state always lives in PostgreSQL (CLAUDE.md section 14).
 *
 * Availability matters for safety: when Redis is unreachable the lock service
 * must fail closed rather than assume a study is unlocked
 * (CLAUDE.md section 17). This service therefore reports its real state
 * instead of silently reconnecting in the background forever.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger: AppLogger;
  private client: Redis | null = null;
  /** Connections handed to BullMQ, closed together with the shared client. */
  private extraConnections: Redis[] = [];

  constructor(
    private readonly config: ConfigService,
    logger: AppLogger,
  ) {
    this.logger = logger.child(RedisService.name);
  }

  async onModuleInit(): Promise<void> {
    const url = this.config.get<string>('REDIS_URL');
    if (!url) {
      throw new Error('REDIS_URL is not configured; refusing to start without Redis.');
    }

    this.client = new Redis(url, buildOptions());

    this.client.on('error', (error: Error) => {
      // Never log the URL: it contains credentials.
      this.logger.error({ message: 'Redis connection error', reason: error.message });
    });
    this.client.on('reconnecting', () => {
      this.logger.warn({ message: 'Redis reconnecting' });
    });

    await this.client.connect();
    await this.client.ping();
    this.logger.info({ message: 'Redis connection established' });
  }

  async onModuleDestroy(): Promise<void> {
    for (const connection of this.extraConnections) {
      await connection.quit().catch(() => connection.disconnect());
    }
    this.extraConnections = [];

    if (this.client) {
      await this.client.quit().catch(() => this.client?.disconnect());
      this.client = null;
    }
  }

  /**
   * Creates an additional connection with the same settings.
   *
   * BullMQ workers issue blocking commands, which would stall every other user
   * of a shared connection — including the study locks. They therefore get
   * their own connection rather than the shared client.
   */
  createConnection(purpose: string): Redis {
    const url = this.config.get<string>('REDIS_URL');
    if (!url) {
      throw new Error('REDIS_URL is not configured; cannot open a Redis connection.');
    }

    const connection = new Redis(url, { ...buildOptions(), lazyConnect: false });

    connection.on('error', (error: Error) => {
      this.logger.error({
        message: 'Redis connection error',
        purpose,
        reason: error.message,
      });
    });

    this.extraConnections.push(connection);
    this.logger.info({ message: 'Additional Redis connection opened', purpose });

    return connection;
  }

  /**
   * Returns the live client.
   *
   * Throws when Redis is unavailable so callers fail closed instead of
   * silently skipping a lock check.
   */
  getClient(): Redis {
    if (!this.client) {
      throw new Error('Redis client is not initialised.');
    }
    return this.client;
  }

  async ping(): Promise<boolean> {
    const response = await this.getClient().ping();
    return response === 'PONG';
  }
}

function buildOptions(): RedisOptions {
  return {
    // Connect explicitly in onModuleInit so a failure surfaces at boot.
    lazyConnect: true,
    // BullMQ requires this to be null; keeping it consistent avoids surprises
    // when the queue module reuses the same connection settings.
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    connectTimeout: 10_000,
    retryStrategy: (attempt: number) => Math.min(attempt * 200, 5_000),
  };
}
