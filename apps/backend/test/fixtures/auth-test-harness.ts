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

// Real v4 UUIDs: the API validates hospital ids as UUIDs, as production rows are.
export const TEST_HOSPITAL = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  code: 'TEST_HOSPITAL',
  name: 'Test Hastanesi',
};
export const OTHER_HOSPITAL = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  code: 'OTHER_HOSPITAL',
  name: 'Diger Hastane',
};

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

/**
 * Study row with its relations already embedded, matching what the service
 * receives from Prisma with STUDY_INCLUDE applied.
 */
export interface StoredStudy {
  id: string;
  hospitalId: string;
  accessionNumber: string;
  status: string;
  category: string;
  modality: string | null;
  studyDescription: string | null;
  studyInstanceUid: string | null;
  externalOrderId: string | null;
  externalProtocolId: string | null;
  arrivalAt: Date | null;
  slaDeadlineAt: Date | null;
  firstHl7ReceivedAt: Date | null;
  secondHl7ReceivedAt: Date | null;
  imagesAvailableAt: Date | null;
  readingStartedAt: Date | null;
  readingCompletedAt: Date | null;
  transcriptionStartedAt: Date | null;
  transcriptionCompletedAt: Date | null;
  finalizedAt: Date | null;
  assignedDoctorId: string | null;
  assignedReporterId: string | null;
  patient: {
    id: string;
    externalPatientId: string;
    firstName: string;
    lastName: string;
    birthDate: Date | null;
    gender: string | null;
  };
  hospital: { id: string; code: string; name: string; shortName: string | null };
  assignedDoctor: { id: string; firstName: string; lastName: string } | null;
  assignedReporter: { id: string; firstName: string; lastName: string } | null;
}

type WhereValue = unknown;

/** Minimal Prisma `where` evaluator covering the operators the service emits. */
function matchesWhere(row: Record<string, unknown>, where: Record<string, WhereValue>): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'OR') {
      const branches = condition as Array<Record<string, WhereValue>>;
      return branches.some((branch) => matchesWhere(row, branch));
    }

    const value = row[key];

    if (condition !== null && typeof condition === 'object') {
      const operators = condition as Record<string, unknown>;

      if ('in' in operators) {
        return (operators.in as unknown[]).includes(value);
      }
      if ('contains' in operators) {
        const needle = String(operators.contains).toLowerCase();
        return typeof value === 'string' && value.toLowerCase().includes(needle);
      }
      // Nested relation filter, e.g. { patient: { lastName: { contains } } }.
      return (
        value !== null &&
        typeof value === 'object' &&
        matchesWhere(value as Record<string, unknown>, operators as Record<string, WhereValue>)
      );
    }

    return value === condition;
  });
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  return String(a) < String(b) ? -1 : 1;
}

function sortRows(
  rows: StoredStudy[],
  orderBy: Array<Record<string, 'asc' | 'desc'>> = [],
): StoredStudy[] {
  return [...rows].sort((left, right) => {
    for (const clause of orderBy) {
      const [field, direction] = Object.entries(clause)[0];
      const result = compare(
        (left as unknown as Record<string, unknown>)[field],
        (right as unknown as Record<string, unknown>)[field],
      );
      if (result !== 0) return direction === 'desc' ? -result : result;
    }
    return 0;
  });
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
  studies: StoredStudy[] = [],
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
    study: {
      count: ({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(
          studies.filter((study) => matchesWhere(study as unknown as Record<string, unknown>, where))
            .length,
        ),
      findMany: ({
        where,
        orderBy,
        skip = 0,
        take,
      }: {
        where: Record<string, unknown>;
        orderBy?: Array<Record<string, 'asc' | 'desc'>>;
        skip?: number;
        take?: number;
      }) => {
        const matched = studies.filter((study) =>
          matchesWhere(study as unknown as Record<string, unknown>, where),
        );
        const sorted = sortRows(matched, orderBy);
        return Promise.resolve(sorted.slice(skip, take === undefined ? undefined : skip + take));
      },
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(studies.find((study) => study.id === where.id) ?? null),
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
export async function createTestHarness(
  options: {
    extraControllers?: Type<unknown>[];
    hospitalAccess?: Array<{ userId: string; hospitalId: string }>;
    studies?: StoredStudy[];
  } = {},
): Promise<TestHarness> {
  const users = await buildTestUsers();
  const prismaStub = createPrismaStub(users, options.hospitalAccess, options.studies);

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
