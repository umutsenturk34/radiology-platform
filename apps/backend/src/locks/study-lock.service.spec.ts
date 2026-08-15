import type { ConfigService } from '@nestjs/config';
import { UserRole } from '@radiology/shared';
import { StudyLockService } from './study-lock.service';
import { AppLogger } from '../common/logging/app-logger.service';
import { AppException } from '../common/errors/app.exception';
import type { RedisService } from '../redis/redis.service';
import type { LockOwner } from './lock.types';

const STUDY_ID = 'study-1';

const DOCTOR_A: LockOwner = {
  userId: 'user-doctor-a',
  displayName: 'Doktor A',
  role: UserRole.DOCTOR,
};
const DOCTOR_B: LockOwner = {
  userId: 'user-doctor-b',
  displayName: 'Doktor B',
  role: UserRole.DOCTOR,
};
const REPORTER: LockOwner = {
  userId: 'user-reporter',
  displayName: 'Raportor',
  role: UserRole.REPORTER,
};

/**
 * In-memory Redis with the semantics the lock service depends on: SET NX PX,
 * PTTL, and the two compare-and-act scripts. Expiry is driven by a clock the
 * test controls, so TTL behaviour is deterministic.
 */
function createFakeRedis() {
  const store = new Map<string, { value: string; expiresAt: number }>();
  let now = 1_000_000;
  let failing = false;

  const isLive = (key: string): boolean => {
    const entry = store.get(key);
    if (!entry) return false;
    if (entry.expiresAt <= now) {
      store.delete(key);
      return false;
    }
    return true;
  };

  const guard = () => {
    if (failing) throw new Error('redis unavailable');
  };

  const client = {
    set: (key: string, value: string, _px: string, ttlMs: string | number, mode?: string) => {
      guard();
      const live = isLive(key);
      if (mode === 'NX' && live) return Promise.resolve(null);
      if (mode === 'XX' && !live) return Promise.resolve(null);
      store.set(key, { value, expiresAt: now + Number(ttlMs) });
      return Promise.resolve('OK');
    },
    get: (key: string) => {
      guard();
      return Promise.resolve(isLive(key) ? (store.get(key) as { value: string }).value : null);
    },
    del: (key: string) => {
      guard();
      const existed = isLive(key);
      store.delete(key);
      return Promise.resolve(existed ? 1 : 0);
    },
    pttl: (key: string) => {
      guard();
      if (!isLive(key)) return Promise.resolve(-2);
      return Promise.resolve((store.get(key) as { expiresAt: number }).expiresAt - now);
    },
    eval: (script: string, _keys: number, key: string, expected: string, ttlMs?: string) => {
      guard();
      if (!isLive(key) || (store.get(key) as { value: string }).value !== expected) {
        return Promise.resolve(0);
      }
      if (script.includes('PEXPIRE')) {
        const entry = store.get(key) as { value: string; expiresAt: number };
        entry.expiresAt = now + Number(ttlMs);
        return Promise.resolve(1);
      }
      store.delete(key);
      return Promise.resolve(1);
    },
  };

  return {
    redis: { getClient: () => client } as unknown as RedisService,
    advanceSeconds: (seconds: number) => {
      now += seconds * 1000;
    },
    setFailing: (value: boolean) => {
      failing = value;
    },
    store,
  };
}

function createService(overrides: { ttlSeconds?: number; heartbeatSeconds?: number } = {}) {
  const fake = createFakeRedis();
  const lock = { ttlSeconds: overrides.ttlSeconds ?? 60, heartbeatSeconds: overrides.heartbeatSeconds ?? 20 }; // prettier-ignore
  const config = {
    get: (key: string) => (key === 'app.lock' ? lock : undefined),
  } as unknown as ConfigService;

  return { ...fake, service: new StudyLockService(fake.redis, config, new AppLogger('error')) };
}

async function expectAppError(promise: Promise<unknown>, code: string): Promise<AppException> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).code).toBe(code);
    return error as AppException;
  }
  throw new Error(`Expected the call to reject with ${code}`);
}

describe('StudyLockService.acquire', () => {
  it('grants the lock to the first caller', async () => {
    const { service } = createService();

    const { lock, alreadyOwned } = await service.acquire(STUDY_ID, DOCTOR_A);

    expect(alreadyOwned).toBe(false);
    expect(lock).toMatchObject({
      studyId: STUDY_ID,
      ownerUserId: DOCTOR_A.userId,
      ownerRole: UserRole.DOCTOR,
    });
  });

  it('refuses a second doctor with 423 STUDY_LOCKED', async () => {
    const { service } = createService();
    await service.acquire(STUDY_ID, DOCTOR_A);

    const error = await expectAppError(service.acquire(STUDY_ID, DOCTOR_B), 'STUDY_LOCKED');

    expect(error.getStatus()).toBe(423);
    expect(error.details).toMatchObject({
      ownerUserId: DOCTOR_A.userId,
      ownerDisplayName: 'Doktor A',
      ownerRole: UserRole.DOCTOR,
    });
  });

  it('refuses a reporter while a doctor holds the lock', async () => {
    const { service } = createService();
    await service.acquire(STUDY_ID, DOCTOR_A);

    await expectAppError(service.acquire(STUDY_ID, REPORTER), 'STUDY_LOCKED');
  });

  it('refuses a second reporter while a reporter holds the lock', async () => {
    const { service } = createService();
    await service.acquire(STUDY_ID, REPORTER);

    await expectAppError(
      service.acquire(STUDY_ID, { ...REPORTER, userId: 'user-reporter-b' }),
      'STUDY_LOCKED',
    );
  });

  it('lets the current owner re-acquire without locking themselves out', async () => {
    const { service } = createService();
    const first = await service.acquire(STUDY_ID, DOCTOR_A);

    const again = await service.acquire(STUDY_ID, DOCTOR_A);

    expect(again.lock.lockedAt).toBe(first.lock.lockedAt);
    // The caller must be able to tell it did not take a new lock, so it does
    // not release one it never took.
    expect(again.alreadyOwned).toBe(true);
  });

  it('locks studies independently', async () => {
    const { service } = createService();
    await service.acquire(STUDY_ID, DOCTOR_A);

    await expect(service.acquire('study-2', DOCTOR_B)).resolves.toMatchObject({
      lock: { ownerUserId: DOCTOR_B.userId },
      alreadyOwned: false,
    });
  });

  it('lets another doctor in once a stale lock expires', async () => {
    const { service, advanceSeconds } = createService({ ttlSeconds: 60 });
    await service.acquire(STUDY_ID, DOCTOR_A);

    advanceSeconds(61);

    await expect(service.acquire(STUDY_ID, DOCTOR_B)).resolves.toMatchObject({
      lock: { ownerUserId: DOCTOR_B.userId },
      alreadyOwned: false,
    });
  });

  it('still holds the lock just before the TTL expires', async () => {
    const { service, advanceSeconds } = createService({ ttlSeconds: 60 });
    await service.acquire(STUDY_ID, DOCTOR_A);

    advanceSeconds(59);

    await expectAppError(service.acquire(STUDY_ID, DOCTOR_B), 'STUDY_LOCKED');
  });
});

describe('StudyLockService.heartbeat', () => {
  it('extends the owner lock', async () => {
    const { service, advanceSeconds } = createService({ ttlSeconds: 60 });
    await service.acquire(STUDY_ID, DOCTOR_A);

    advanceSeconds(40);
    const result = await service.heartbeat(STUDY_ID, DOCTOR_A.userId);
    advanceSeconds(40);

    expect(result).toEqual({ expiresInSeconds: 60 });
    // Without the heartbeat the lock would have expired by now.
    await expectAppError(service.acquire(STUDY_ID, DOCTOR_B), 'STUDY_LOCKED');
  });

  it('refuses a heartbeat from anyone but the owner', async () => {
    const { service } = createService();
    await service.acquire(STUDY_ID, DOCTOR_A);

    const error = await expectAppError(
      service.heartbeat(STUDY_ID, DOCTOR_B.userId),
      'LOCK_NOT_OWNED',
    );

    expect(error.getStatus()).toBe(423);
  });

  it('refuses a heartbeat on a lock that already expired', async () => {
    const { service, advanceSeconds } = createService({ ttlSeconds: 60 });
    await service.acquire(STUDY_ID, DOCTOR_A);

    advanceSeconds(61);

    await expectAppError(service.heartbeat(STUDY_ID, DOCTOR_A.userId), 'LOCK_NOT_OWNED');
  });
});

describe('StudyLockService.release', () => {
  it('releases the owner lock and frees the study', async () => {
    const { service } = createService();
    await service.acquire(STUDY_ID, DOCTOR_A);

    await expect(service.release(STUDY_ID, DOCTOR_A.userId)).resolves.toBe(true);
    await expect(service.acquire(STUDY_ID, DOCTOR_B)).resolves.toMatchObject({
      lock: { ownerUserId: DOCTOR_B.userId },
    });
  });

  it('refuses to release someone else lock', async () => {
    const { service } = createService();
    await service.acquire(STUDY_ID, DOCTOR_A);

    await expectAppError(service.release(STUDY_ID, DOCTOR_B.userId), 'LOCK_NOT_OWNED');
    await expect(service.getLock(STUDY_ID)).resolves.toMatchObject({
      ownerUserId: DOCTOR_A.userId,
    });
  });

  it('treats releasing nothing as a no-op', async () => {
    const { service } = createService();

    await expect(service.release(STUDY_ID, DOCTOR_A.userId)).resolves.toBe(false);
  });

  it('does not delete a lock that was retaken after expiry', async () => {
    const { service, advanceSeconds } = createService({ ttlSeconds: 60 });
    await service.acquire(STUDY_ID, DOCTOR_A);
    advanceSeconds(61);
    await service.acquire(STUDY_ID, DOCTOR_B);

    // Doctor A's late release must not remove doctor B's lock.
    await expectAppError(service.release(STUDY_ID, DOCTOR_A.userId), 'LOCK_NOT_OWNED');
    await expect(service.getLock(STUDY_ID)).resolves.toMatchObject({
      ownerUserId: DOCTOR_B.userId,
    });
  });
});

describe('StudyLockService.forceRelease', () => {
  it('removes another user lock and reports who held it', async () => {
    const { service } = createService();
    await service.acquire(STUDY_ID, DOCTOR_A);

    const previous = await service.forceRelease(STUDY_ID);

    expect(previous).toMatchObject({ ownerUserId: DOCTOR_A.userId });
    await expect(service.getLock(STUDY_ID)).resolves.toBeNull();
  });

  it('returns null when there was no lock', async () => {
    const { service } = createService();

    await expect(service.forceRelease(STUDY_ID)).resolves.toBeNull();
  });
});

describe('StudyLockService.describe', () => {
  it('reports an unlocked study', async () => {
    const { service } = createService();

    await expect(service.describe(STUDY_ID)).resolves.toEqual({
      locked: false,
      ownerUserId: null,
      ownerDisplayName: null,
      ownerRole: null,
      lockedAt: null,
      expiresInSeconds: null,
    });
  });

  it('reports the owner and the remaining time', async () => {
    const { service, advanceSeconds } = createService({ ttlSeconds: 60 });
    await service.acquire(STUDY_ID, DOCTOR_A);
    advanceSeconds(20);

    await expect(service.describe(STUDY_ID)).resolves.toMatchObject({
      locked: true,
      ownerUserId: DOCTOR_A.userId,
      ownerDisplayName: 'Doktor A',
      ownerRole: UserRole.DOCTOR,
      expiresInSeconds: 40,
    });
  });
});

describe('StudyLockService — Redis unavailable', () => {
  it('fails closed on acquire instead of assuming the study is free', async () => {
    const { service, setFailing } = createService();
    setFailing(true);

    const error = await expectAppError(
      service.acquire(STUDY_ID, DOCTOR_A),
      'SERVICE_UNAVAILABLE',
    );

    expect(error.getStatus()).toBe(503);
  });

  it.each([
    ['getLock', (s: StudyLockService) => s.getLock(STUDY_ID)],
    ['describe', (s: StudyLockService) => s.describe(STUDY_ID)],
    ['heartbeat', (s: StudyLockService) => s.heartbeat(STUDY_ID, DOCTOR_A.userId)],
    ['release', (s: StudyLockService) => s.release(STUDY_ID, DOCTOR_A.userId)],
    ['forceRelease', (s: StudyLockService) => s.forceRelease(STUDY_ID)],
  ])('fails closed on %s', async (_label, call) => {
    const { service, setFailing } = createService();
    setFailing(true);

    await expectAppError(call(service), 'SERVICE_UNAVAILABLE');
  });

  it('fails closed when the client itself is unavailable', async () => {
    const redis = {
      getClient: () => {
        throw new Error('Redis client is not initialised.');
      },
    } as unknown as RedisService;
    const config = {
      get: () => ({ ttlSeconds: 60, heartbeatSeconds: 20 }),
    } as unknown as import('@nestjs/config').ConfigService;
    const service = new StudyLockService(redis, config, new AppLogger('error'));

    await expectAppError(service.acquire(STUDY_ID, DOCTOR_A), 'SERVICE_UNAVAILABLE');
  });

  it('treats a corrupt lock value as unreadable rather than unlocked', async () => {
    const { service, store } = createService();
    store.set(`lock:study:${STUDY_ID}`, { value: 'not-json', expiresAt: Number.MAX_SAFE_INTEGER });

    await expectAppError(service.getLock(STUDY_ID), 'SERVICE_UNAVAILABLE');
  });
});
