import type { INestApplication, Type } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { hash as argonHash } from '@node-rs/argon2';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { loadConfiguration } from '../../src/config/configuration';
import { AppLogger } from '../../src/common/logging/app-logger.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RedisService } from '../../src/redis/redis.service';
import { REFRESH_COOKIE_NAME } from '../../src/auth/auth.constants';

/**
 * Shared harness for the auth-facing e2e suites.
 *
 * PostgreSQL and Redis are stubbed on purpose: the only provisioned databases
 * are the shared Railway pilot instances, and an automated suite must never
 * write to them. Routing, guards, validation, cookies and the error envelope
 * are exercised for real.
 */

export const TEST_PASSWORD = 'PilotTest!2026';

export const TEST_HOSPITAL = { id: 'hospital-1', code: 'TEST_HOSPITAL', name: 'Test Hastanesi' };
export const OTHER_HOSPITAL = { id: 'hospital-2', code: 'OTHER_HOSPITAL', name: 'Diger Hastane' };

export interface StoredUser {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
  lastLoginAt: Date | null;
}

export interface StoredSession {
  id: string;
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  ipAddress?: string;
  userAgent?: string;
}

interface UserFindArgs {
  where: { id?: string; email?: string };
  include?: { hospitalAccess?: boolean | { select?: unknown } };
}

interface SessionFindArgs {
  where: { id?: string; refreshTokenHash?: string };
  include?: { user?: boolean | { include?: unknown } };
}

interface SessionWhere {
  id?: string;
  userId?: string;
  refreshTokenHash?: string;
  revokedAt?: null;
}

/** The four pilot roles plus two disabled accounts, all sharing one password. */
export async function buildTestUsers(): Promise<StoredUser[]> {
  const passwordHash = await argonHash(TEST_PASSWORD);
  const base = { passwordHash, firstName: 'Test', lastName: 'Kullanici', lastLoginAt: null };

  return [
    { id: 'u-doctor', email: 'doctor@test.local', username: 'doctor', role: 'DOCTOR', status: 'ACTIVE', ...base }, // prettier-ignore
    { id: 'u-reporter', email: 'reporter@test.local', username: 'reporter', role: 'REPORTER', status: 'ACTIVE', ...base }, // prettier-ignore
    { id: 'u-operation', email: 'operation@test.local', username: 'operation', role: 'OPERATION', status: 'ACTIVE', ...base }, // prettier-ignore
    { id: 'u-manager', email: 'manager@test.local', username: 'manager', role: 'MANAGER', status: 'ACTIVE', ...base }, // prettier-ignore
    { id: 'u-inactive', email: 'inactive@test.local', username: 'inactive', role: 'DOCTOR', status: 'INACTIVE', ...base }, // prettier-ignore
    { id: 'u-suspended', email: 'suspended@test.local', username: 'suspended', role: 'DOCTOR', status: 'SUSPENDED', ...base }, // prettier-ignore
  ];
}

export function createPrismaStub(
  users: StoredUser[],
  hospitalAccess?: Array<{ userId: string; hospitalId: string }>,
) {
  const sessions: StoredSession[] = [];
  const accessRows =
    hospitalAccess ??
    users
      .filter((user) => user.status === 'ACTIVE')
      .map((user) => ({ userId: user.id, hospitalId: TEST_HOSPITAL.id }));

  const hospitals = [TEST_HOSPITAL, OTHER_HOSPITAL];

  const service = {
    ping: jest.fn(async () => true),
    $connect: jest.fn(async () => undefined),
    $disconnect: jest.fn(async () => undefined),
    onModuleInit: jest.fn(async () => undefined),
    onModuleDestroy: jest.fn(async () => undefined),
    $transaction: (operations: Array<Promise<unknown>>) => Promise.all(operations),
    user: {
      findUnique: ({ where, include }: UserFindArgs) => {
        const user = users.find((candidate) =>
          where.id !== undefined ? candidate.id === where.id : candidate.email === where.email,
        );
        if (!user) return Promise.resolve(null);
        if (!include?.hospitalAccess) return Promise.resolve(user);

        return Promise.resolve({ ...user, hospitalAccess: accessFor(user.id, include) });
      },
      update: ({ where, data }: { where: { id: string }; data: Partial<StoredUser> }) => {
        const user = users.find((candidate) => candidate.id === where.id);
        Object.assign(user as StoredUser, data);
        return Promise.resolve(user);
      },
    },
    userSession: {
      create: ({ data }: { data: StoredSession }) => {
        const session: StoredSession = { ...data, revokedAt: data.revokedAt ?? null };
        sessions.push(session);
        return Promise.resolve(session);
      },
      findUnique: ({ where, include }: SessionFindArgs) => {
        const session = sessions.find((s) =>
          where.id !== undefined ? s.id === where.id : s.refreshTokenHash === where.refreshTokenHash,
        );
        if (!session) return Promise.resolve(null);

        const user = users.find((u) => u.id === session.userId);
        const wantsHospitalAccess =
          typeof include?.user === 'object' && include.user !== null && 'include' in include.user;

        return Promise.resolve({
          ...session,
          user:
            user && wantsHospitalAccess
              ? {
                  ...user,
                  hospitalAccess: accessRows
                    .filter((row) => row.userId === user.id)
                    .map((row) => ({ hospitalId: row.hospitalId })),
                }
              : user,
        });
      },
      update: ({ where, data }: { where: { id: string }; data: Partial<StoredSession> }) => {
        const session = sessions.find((s) => s.id === where.id);
        Object.assign(session as StoredSession, data);
        return Promise.resolve(session);
      },
      updateMany: ({ where, data }: { where: SessionWhere; data: Partial<StoredSession> }) => {
        const matches = sessions.filter(
          (s) =>
            (where.userId === undefined || s.userId === where.userId) &&
            (where.refreshTokenHash === undefined ||
              s.refreshTokenHash === where.refreshTokenHash) &&
            (where.revokedAt !== null || s.revokedAt === null),
        );
        matches.forEach((session) => Object.assign(session, data));
        return Promise.resolve({ count: matches.length });
      },
    },
  };

  function accessFor(userId: string, include: UserFindArgs['include']) {
    const rows = accessRows.filter((row) => row.userId === userId);
    const selectsIdOnly =
      typeof include?.hospitalAccess === 'object' && 'select' in include.hospitalAccess;

    return rows.map((row) =>
      selectsIdOnly
        ? { hospitalId: row.hospitalId }
        : {
            hospitalId: row.hospitalId,
            hospital: hospitals.find((hospital) => hospital.id === row.hospitalId),
          },
    );
  }

  return { service, sessions };
}

export function createRedisStub() {
  return {
    ping: jest.fn(async () => true),
    getClient: jest.fn(() => {
      throw new Error('Redis client is not available in tests.');
    }),
    onModuleInit: jest.fn(async () => undefined),
    onModuleDestroy: jest.fn(async () => undefined),
  };
}

export interface TestHarness {
  app: INestApplication;
  users: StoredUser[];
  sessions: StoredSession[];
  /** Returns the supertest chain (not a promise) so `.expect()` stays usable. */
  login: (email: string, password?: string) => request.Test;
  /** Logs in and returns the access token. */
  accessTokenFor: (email: string) => Promise<string>;
  close: () => Promise<void>;
}

/**
 * Boots the real application with stubbed infrastructure.
 *
 * `extraControllers` lets a suite mount probe routes that exercise a guard
 * without inventing production endpoints the API contract does not define.
 */
export async function createTestHarness(options: {
  extraControllers?: Type<unknown>[];
  hospitalAccess?: Array<{ userId: string; hospitalId: string }>;
} = {}): Promise<TestHarness> {
  const users = await buildTestUsers();
  const prismaStub = createPrismaStub(users, options.hospitalAccess);

  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
    controllers: options.extraControllers ?? [],
  })
    .overrideProvider(PrismaService)
    .useValue(prismaStub.service)
    .overrideProvider(RedisService)
    .useValue(createRedisStub())
    .compile();

  const app = moduleRef.createNestApplication({ logger: false });
  const config = loadConfiguration({ ...process.env, LOG_LEVEL: 'error' });
  configureApp(app, config, new AppLogger('error'));
  await app.init();

  const login = (email: string, password = TEST_PASSWORD): request.Test =>
    request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password });

  return {
    app,
    users,
    sessions: prismaStub.sessions,
    login,
    accessTokenFor: async (email: string) => {
      const response = await login(email).expect(200);
      return response.body.data.accessToken as string;
    },
    close: () => app.close(),
  };
}

export function readRefreshCookie(response: request.Response): string | undefined {
  const raw = response.headers['set-cookie'];
  const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return cookies.find((cookie) => cookie.startsWith(`${REFRESH_COOKIE_NAME}=`));
}

export function cookieValue(cookie: string): string {
  return cookie.split(';')[0];
}
