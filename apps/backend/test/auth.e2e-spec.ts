import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { hash as argonHash } from '@node-rs/argon2';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { loadConfiguration } from '../src/config/configuration';
import { AppLogger } from '../src/common/logging/app-logger.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { REFRESH_COOKIE_NAME } from '../src/auth/auth.constants';

/**
 * Auth HTTP contract (TASK_QUEUE BACKEND-006, docs/API_CONTRACT.md 17-21).
 *
 * PostgreSQL and Redis are stubbed for the same reason as the health suite:
 * the only provisioned databases are the shared Railway pilot instances, and an
 * automated suite must never write to them. Routing, guards, validation,
 * cookies and the error envelope are exercised for real.
 */

const PASSWORD = 'PilotTest!2026';

interface StoredUser {
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

interface StoredSession {
  id: string;
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  ipAddress?: string;
  userAgent?: string;
}

const HOSPITAL = { id: 'hospital-1', code: 'TEST_HOSPITAL', name: 'Test Hastanesi' };

interface UserFindArgs {
  where: { id?: string; email?: string };
  include?: { hospitalAccess?: boolean | { select?: unknown } };
}

interface SessionWhere {
  id?: string;
  userId?: string;
  refreshTokenHash?: string;
  revokedAt?: null;
}

interface SessionFindArgs {
  where: { id?: string; refreshTokenHash?: string };
  include?: { user?: boolean | { include?: unknown } };
}

function createPrismaStub(users: StoredUser[]) {
  const sessions: StoredSession[] = [];
  const accessRows = users
    .filter((user) => user.status === 'ACTIVE')
    .map((user) => ({ userId: user.id, hospitalId: HOSPITAL.id }));

  return {
    sessions,
    service: {
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

          const rows = accessRows.filter((row) => row.userId === user.id);
          const selectsIdOnly =
            typeof include.hospitalAccess === 'object' && 'select' in include.hospitalAccess;

          return Promise.resolve({
            ...user,
            hospitalAccess: rows.map((row) =>
              selectsIdOnly
                ? { hospitalId: row.hospitalId }
                : { hospitalId: row.hospitalId, hospital: HOSPITAL },
            ),
          });
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
            where.id !== undefined
              ? s.id === where.id
              : s.refreshTokenHash === where.refreshTokenHash,
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
        updateMany: ({
          where,
          data,
        }: {
          where: SessionWhere;
          data: Partial<StoredSession>;
        }) => {
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
    },
  };
}

function createRedisStub() {
  return {
    ping: jest.fn(async () => true),
    getClient: jest.fn(() => {
      throw new Error('Redis client is not available in tests.');
    }),
    onModuleInit: jest.fn(async () => undefined),
    onModuleDestroy: jest.fn(async () => undefined),
  };
}

function readRefreshCookie(response: request.Response): string | undefined {
  const raw = response.headers['set-cookie'];
  const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return cookies.find((cookie) => cookie.startsWith(`${REFRESH_COOKIE_NAME}=`));
}

function cookieValue(cookie: string): string {
  return cookie.split(';')[0];
}

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prismaStub: ReturnType<typeof createPrismaStub>;
  let users: StoredUser[];

  beforeAll(async () => {
    const passwordHash = await argonHash(PASSWORD);
    const base = { passwordHash, firstName: 'Test', lastName: 'Kullanici', lastLoginAt: null };

    users = [
      { id: 'u-doctor', email: 'doctor@test.local', username: 'doctor', role: 'DOCTOR', status: 'ACTIVE', ...base }, // prettier-ignore
      { id: 'u-reporter', email: 'reporter@test.local', username: 'reporter', role: 'REPORTER', status: 'ACTIVE', ...base }, // prettier-ignore
      { id: 'u-operation', email: 'operation@test.local', username: 'operation', role: 'OPERATION', status: 'ACTIVE', ...base }, // prettier-ignore
      { id: 'u-manager', email: 'manager@test.local', username: 'manager', role: 'MANAGER', status: 'ACTIVE', ...base }, // prettier-ignore
      { id: 'u-inactive', email: 'inactive@test.local', username: 'inactive', role: 'DOCTOR', status: 'INACTIVE', ...base }, // prettier-ignore
      { id: 'u-suspended', email: 'suspended@test.local', username: 'suspended', role: 'DOCTOR', status: 'SUSPENDED', ...base }, // prettier-ignore
    ];

    prismaStub = createPrismaStub(users);

    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaStub.service)
      .overrideProvider(RedisService)
      .useValue(createRedisStub())
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
    const config = loadConfiguration({ ...process.env, LOG_LEVEL: 'error' });
    configureApp(app, config, new AppLogger('error'));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  /** Returns the supertest chain (not a promise) so `.expect()` stays usable. */
  function login(email: string, password = PASSWORD): request.Test {
    return request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password });
  }

  describe('POST /auth/login', () => {
    it.each([
      ['doctor@test.local', 'DOCTOR'],
      ['reporter@test.local', 'REPORTER'],
      ['operation@test.local', 'OPERATION'],
      ['manager@test.local', 'MANAGER'],
    ])('logs in %s and returns the contract shape', async (email, role) => {
      const response = await login(email).expect(200);

      expect(response.body.data).toMatchObject({
        accessToken: expect.any(String),
        expiresIn: 900,
        user: { email, role, status: 'ACTIVE' },
      });
    });

    it('never returns the refresh token or the password hash in the body', async () => {
      const response = await login('doctor@test.local').expect(200);

      expect(response.body.data).not.toHaveProperty('refreshToken');
      expect(JSON.stringify(response.body)).not.toContain('passwordHash');
      expect(JSON.stringify(response.body)).not.toContain('$argon2');
    });

    it('sets the refresh token as a scoped HttpOnly cookie', async () => {
      const response = await login('doctor@test.local').expect(200);
      const cookie = readRefreshCookie(response);

      expect(cookie).toBeDefined();
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Path=/api/v1/auth');
      // Non-production keeps SameSite=Lax so plain-http local development works.
      expect(cookie).toContain('SameSite=Lax');
    });

    it('rejects a wrong password with INVALID_CREDENTIALS', async () => {
      const response = await login('doctor@test.local', 'wrong-password').expect(401);

      expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('answers an unknown email exactly like a wrong password', async () => {
      const unknown = await login('nobody@test.local').expect(401);
      const wrong = await login('doctor@test.local', 'wrong-password').expect(401);

      expect(unknown.body).toEqual(wrong.body);
    });

    it('rejects an inactive account with USER_INACTIVE', async () => {
      const response = await login('inactive@test.local').expect(403);

      expect(response.body.error.code).toBe('USER_INACTIVE');
    });

    it('rejects a suspended account with USER_SUSPENDED', async () => {
      const response = await login('suspended@test.local').expect(403);

      expect(response.body.error.code).toBe('USER_SUSPENDED');
    });

    it('returns VALIDATION_ERROR for a malformed body', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'not-an-email' })
        .expect(422);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details.fields).toHaveProperty('email');
      expect(response.body.error.details.fields).toHaveProperty('password');
    });

    it('rejects unknown body properties instead of ignoring them', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'doctor@test.local', password: PASSWORD, role: 'MANAGER' })
        .expect(422);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /auth/me', () => {
    it('returns the profile with authorized hospitals', async () => {
      const loginResponse = await login('doctor@test.local').expect(200);

      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${loginResponse.body.data.accessToken}`)
        .expect(200);

      expect(response.body.data).toMatchObject({
        email: 'doctor@test.local',
        role: 'DOCTOR',
        hospitals: [{ code: 'TEST_HOSPITAL' }],
      });
      expect(response.body.data).not.toHaveProperty('passwordHash');
    });

    it.each([
      ['no header', undefined],
      ['a malformed token', 'Bearer not-a-jwt'],
      ['the wrong scheme', 'Basic ZG9jdG9yOnBhc3M='],
      ['an empty bearer value', 'Bearer '],
    ])('rejects %s with 401', async (_label, header) => {
      const call = request(app.getHttpServer()).get('/api/v1/auth/me');
      if (header) call.set('Authorization', header);

      const response = await call.expect(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects a refresh token used as an access token', async () => {
      const loginResponse = await login('doctor@test.local').expect(200);
      const refreshToken = cookieValue(readRefreshCookie(loginResponse) as string).split('=')[1];

      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${refreshToken}`)
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /auth/refresh', () => {
    it('issues a new access token and rotates the cookie', async () => {
      const loginResponse = await login('reporter@test.local').expect(200);
      const cookie = readRefreshCookie(loginResponse) as string;

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookieValue(cookie))
        .expect(200);

      expect(response.body.data).toMatchObject({
        accessToken: expect.any(String),
        expiresIn: 900,
      });
      expect(response.body.data).not.toHaveProperty('refreshToken');

      const rotated = readRefreshCookie(response) as string;
      expect(cookieValue(rotated)).not.toBe(cookieValue(cookie));
    });

    it('returns an access token that works on a guarded route', async () => {
      const loginResponse = await login('manager@test.local').expect(200);

      const refreshResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookieValue(readRefreshCookie(loginResponse) as string))
        .expect(200);

      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${refreshResponse.body.data.accessToken}`)
        .expect(200);
    });

    it('retires the access token issued by the rotated session', async () => {
      const loginResponse = await login('doctor@test.local').expect(200);
      const oldAccessToken = loginResponse.body.data.accessToken;

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookieValue(readRefreshCookie(loginResponse) as string))
        .expect(200);

      // Documented contract: after refreshing, the client must use the new
      // access token. The old one belongs to the now-revoked session.
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${oldAccessToken}`)
        .expect(401);
    });

    it('rejects a request without the cookie', async () => {
      const response = await request(app.getHttpServer()).post('/api/v1/auth/refresh').expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects a rotated cookie being replayed', async () => {
      const loginResponse = await login('operation@test.local').expect(200);
      const original = cookieValue(readRefreshCookie(loginResponse) as string);

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', original)
        .expect(200);

      const replay = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', original)
        .expect(401);

      expect(replay.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /auth/logout', () => {
    it('revokes the session, clears the cookie and blocks a later refresh', async () => {
      const loginResponse = await login('doctor@test.local').expect(200);
      const cookie = cookieValue(readRefreshCookie(loginResponse) as string);

      const logoutResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Cookie', cookie)
        .expect(204);

      const cleared = readRefreshCookie(logoutResponse) as string;
      expect(cleared).toContain(`${REFRESH_COOKIE_NAME}=;`);

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie)
        .expect(401);
    });

    it('succeeds without a cookie so a stale client can still clear its state', async () => {
      await request(app.getHttpServer()).post('/api/v1/auth/logout').expect(204);
    });

    it('invalidates the already-issued access token immediately', async () => {
      const loginResponse = await login('manager@test.local').expect(200);
      const accessToken = loginResponse.body.data.accessToken;
      const cookie = cookieValue(readRefreshCookie(loginResponse) as string);

      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Cookie', cookie)
        .expect(204);

      // The token is still cryptographically valid; the revoked session is what
      // stops it, so logout does not leave a usable window.
      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('global guard', () => {
    it('keeps the health endpoint public', async () => {
      await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    });

    it('still returns 404 (not 401) for an unknown route', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/nope').expect(404);

      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });
});
