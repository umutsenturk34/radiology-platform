import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiErrorCode } from '@radiology/shared';
import { RedisService } from '../redis/redis.service';
import { AppException, ServiceUnavailableAppException } from '../common/errors/app.exception';
import { AppLogger } from '../common/logging/app-logger.service';
import type { LockConfig } from '../config/configuration';
import type { LockOwner, StudyLock, StudyLockInfo } from './lock.types';

export interface StudyLockAcquireResult {
  lock: StudyLock;
  /** True when the caller already held this lock and it was only refreshed. */
  alreadyOwned: boolean;
}

/** 423 — another user holds the study lock. */
export class StudyLockedException extends AppException {
  constructor(lock: StudyLock) {
    super(ApiErrorCode.STUDY_LOCKED, 'Study is currently locked by another user.', HttpStatus.LOCKED, {
      ownerUserId: lock.ownerUserId,
      ownerDisplayName: lock.ownerDisplayName,
      ownerRole: lock.ownerRole,
      lockedAt: lock.lockedAt,
    });
  }
}

/** 423 — the caller is not the current lock owner. */
export class LockNotOwnedException extends AppException {
  constructor(details?: Record<string, unknown>) {
    super(
      ApiErrorCode.LOCK_NOT_OWNED,
      'Current user does not own the study lock.',
      HttpStatus.LOCKED,
      details,
    );
  }
}

/**
 * Release only when the caller still owns the lock.
 *
 * Compare-and-delete has to be atomic: between a GET and a DEL the lock could
 * expire and be taken by someone else, and this would then delete their lock.
 */
const RELEASE_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;

/** Extend only the owner's own lock, for the same reason. */
const HEARTBEAT_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("PEXPIRE", KEYS[1], ARGV[2])
end
return 0
`;

/**
 * Redis study locks (TASK_QUEUE BACKEND-015).
 *
 * Two users must never edit the same study at once, so acquisition is a single
 * atomic `SET NX PX` and the lock always carries an expiry — a crashed browser
 * cannot leave a study locked forever
 * (docs/WORKFLOW_STATE_MACHINE.md sections 31-34).
 *
 * When Redis is unreachable every operation fails closed: the backend refuses
 * the action rather than assuming the study is free (CLAUDE.md section 17).
 */
@Injectable()
export class StudyLockService {
  private readonly logger: AppLogger;
  private readonly lockConfig: LockConfig;

  constructor(
    private readonly redis: RedisService,
    config: ConfigService,
    logger: AppLogger,
  ) {
    this.logger = logger.child(StudyLockService.name);
    this.lockConfig = config.get<LockConfig>('app.lock') ?? {
      ttlSeconds: 60,
      heartbeatSeconds: 20,
    };
  }

  get ttlSeconds(): number {
    return this.lockConfig.ttlSeconds;
  }

  get heartbeatSeconds(): number {
    return this.lockConfig.heartbeatSeconds;
  }

  /**
   * Takes the lock, or throws 423 when someone else already holds it.
   *
   * Re-acquiring a lock you already own is allowed and simply refreshes it, so
   * a doctor reopening their own study is not locked out by themselves.
   *
   * `alreadyOwned` tells the caller whether this call created the lock. A
   * caller that releases on failure must not release a lock it did not take —
   * that would drop the owner's still-valid lock.
   */
  async acquire(studyId: string, owner: LockOwner): Promise<StudyLockAcquireResult> {
    const key = lockKey(studyId);
    const lock: StudyLock = {
      studyId,
      ownerUserId: owner.userId,
      ownerDisplayName: owner.displayName,
      ownerRole: owner.role,
      lockedAt: new Date().toISOString(),
    };

    const client = this.client();
    const stored = await this.run(() =>
      client.set(key, JSON.stringify(lock), 'PX', this.ttlMs(), 'NX'),
    );

    if (stored === 'OK') {
      this.logger.info({ message: 'Study lock acquired', studyId, ownerUserId: owner.userId });
      return { lock, alreadyOwned: false };
    }

    const existing = await this.getLock(studyId);

    if (!existing) {
      // The previous lock expired between our SET and this read; try once more.
      const retry = await this.run(() =>
        client.set(key, JSON.stringify(lock), 'PX', this.ttlMs(), 'NX'),
      );
      if (retry === 'OK') {
        this.logger.info({ message: 'Study lock acquired', studyId, ownerUserId: owner.userId });
        return { lock, alreadyOwned: false };
      }
      const current = await this.getLock(studyId);
      if (!current) {
        throw new ServiceUnavailableAppException('Could not establish the study lock.', 'redis');
      }
      throw new StudyLockedException(current);
    }

    if (existing.ownerUserId === owner.userId) {
      await this.run(() => client.set(key, JSON.stringify(existing), 'PX', this.ttlMs(), 'XX'));
      return { lock: existing, alreadyOwned: true };
    }

    this.logger.warn({
      message: 'Study lock conflict',
      studyId,
      requestedBy: owner.userId,
      heldBy: existing.ownerUserId,
    });
    throw new StudyLockedException(existing);
  }

  /** Extends the caller's own lock. Throws 423 when they no longer own it. */
  async heartbeat(studyId: string, userId: string): Promise<{ expiresInSeconds: number }> {
    const existing = await this.getLock(studyId);

    if (!existing || existing.ownerUserId !== userId) {
      throw new LockNotOwnedException({ studyId });
    }

    const refreshed = await this.run(() =>
      this.client().eval(
        HEARTBEAT_SCRIPT,
        1,
        lockKey(studyId),
        JSON.stringify(existing),
        String(this.ttlMs()),
      ),
    );

    if (refreshed !== 1) {
      // Expired between the read and the extend.
      throw new LockNotOwnedException({ studyId });
    }

    return { expiresInSeconds: this.ttlSeconds };
  }

  /**
   * Releases the caller's own lock.
   *
   * Returns false when there was nothing of theirs to release, so a duplicate
   * release is harmless rather than an error the user cannot act on.
   */
  async release(studyId: string, userId: string): Promise<boolean> {
    const existing = await this.getLock(studyId);
    if (!existing) return false;

    if (existing.ownerUserId !== userId) {
      throw new LockNotOwnedException({ studyId });
    }

    const removed = await this.run(() =>
      this.client().eval(RELEASE_SCRIPT, 1, lockKey(studyId), JSON.stringify(existing)),
    );

    if (removed === 1) {
      this.logger.info({ message: 'Study lock released', studyId, ownerUserId: userId });
      return true;
    }

    return false;
  }

  /**
   * Administrative release, used when an owner cannot release their own lock
   * (docs/WORKFLOW_STATE_MACHINE.md section 33).
   *
   * Exceptional recovery behaviour, never the normal takeover path
   * (CLAUDE.md section 18): the caller's authorization, the reason and the
   * audit entry are enforced by the action service above this one.
   */
  async forceRelease(studyId: string): Promise<StudyLock | null> {
    const existing = await this.getLock(studyId);
    if (!existing) return null;

    await this.run(() => this.client().del(lockKey(studyId)));

    this.logger.warn({
      message: 'Study lock force released',
      studyId,
      previousOwnerUserId: existing.ownerUserId,
    });

    return existing;
  }

  async getLock(studyId: string): Promise<StudyLock | null> {
    const raw = await this.run(() => this.client().get(lockKey(studyId)));
    if (!raw) return null;

    try {
      return JSON.parse(raw) as StudyLock;
    } catch {
      // A corrupt value must not read as "unlocked"; drop it and report locked
      // state as unknown by failing closed.
      this.logger.error({ message: 'Corrupt study lock value', studyId });
      throw new ServiceUnavailableAppException('Study lock state is unreadable.', 'redis');
    }
  }

  /** Lock state for a client, including the remaining TTL. */
  async describe(studyId: string): Promise<StudyLockInfo> {
    const lock = await this.getLock(studyId);

    if (!lock) {
      return {
        locked: false,
        ownerUserId: null,
        ownerDisplayName: null,
        ownerRole: null,
        lockedAt: null,
        expiresInSeconds: null,
      };
    }

    const remainingMs = await this.run(() => this.client().pttl(lockKey(studyId)));

    return {
      locked: true,
      ownerUserId: lock.ownerUserId,
      ownerDisplayName: lock.ownerDisplayName,
      ownerRole: lock.ownerRole,
      lockedAt: lock.lockedAt,
      expiresInSeconds: remainingMs > 0 ? Math.ceil(remainingMs / 1000) : null,
    };
  }

  private ttlMs(): number {
    return this.lockConfig.ttlSeconds * 1000;
  }

  private client() {
    try {
      return this.redis.getClient();
    } catch {
      throw new ServiceUnavailableAppException(
        'Study locking is unavailable; the action was refused.',
        'redis',
      );
    }
  }

  /**
   * Turns any Redis failure into a 503 rather than letting it surface as an
   * unexpected error — an unreachable Redis must never be read as "unlocked".
   */
  private async run<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof AppException) throw error;

      this.logger.error({
        message: 'Redis lock operation failed',
        reason: error instanceof Error ? error.message : 'unknown error',
      });
      throw new ServiceUnavailableAppException(
        'Study locking is unavailable; the action was refused.',
        'redis',
      );
    }
  }
}

function lockKey(studyId: string): string {
  return `lock:study:${studyId}`;
}
