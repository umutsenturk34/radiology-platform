import { JwtService } from '@nestjs/jwt';
import type { ConfigService } from '@nestjs/config';
import { hash as argonHash } from '@node-rs/argon2';
import { UserRole, UserStatus } from '@radiology/shared';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import type { JwtConfig } from '../config/configuration';
import { AppLogger } from '../common/logging/app-logger.service';
import { AppException } from '../common/errors/app.exception';
import type { PrismaService } from '../prisma/prisma.service';

const JWT_CONFIG: JwtConfig = {
  accessSecret: 'access-secret-that-is-long-enough-for-tests',
  refreshSecret: 'refresh-secret-that-is-long-enough-for-tests',
  accessTtlSeconds: 900,
  refreshTtlSeconds: 604800,
};

const PASSWORD = 'PilotTest!2026';

interface FakeUser {
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

interface FakeSession {
  id: string;
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  ipAddress?: string;
  userAgent?: string;
}

interface FakeHospital {
  id: string;
  code: string;
  name: string;
}

/**
 * In-memory stand-in for the Prisma delegates AuthService uses. Keeps the auth
 * rules under test without touching the shared pilot database.
 */
function createFakePrisma(users: FakeUser[], access: Array<{ userId: string; hospitalId: string }>) {
  const hospitals: FakeHospital[] = [
    { id: 'hospital-1', code: 'TEST_HOSPITAL', name: 'Test Hastanesi' },
    { id: 'hospital-2', code: 'OTHER_HOSPITAL', name: 'Diger Hastane' },
  ];
  const sessions: FakeSession[] = [];

  const withHospitalAccess = (user: FakeUser, mode: 'full' | 'idOnly') => ({
    ...user,
    hospitalAccess: access
      .filter((row) => row.userId === user.id)
      .map((row) =>
        mode === 'idOnly'
          ? { hospitalId: row.hospitalId }
          : {
              hospitalId: row.hospitalId,
              hospital: hospitals.find((h) => h.id === row.hospitalId),
            },
      ),
  });

  const prisma = {
    user: {
      findUnique: ({ where, include }: UserFindArgs) => {
        const user = users.find((u) =>
          where.id !== undefined ? u.id === where.id : u.email === where.email,
        );
        if (!user) return Promise.resolve(null);
        if (!include?.hospitalAccess) return Promise.resolve(user);

        const selectsIdOnly =
          typeof include.hospitalAccess === 'object' && 'select' in include.hospitalAccess;
        return Promise.resolve(withHospitalAccess(user, selectsIdOnly ? 'idOnly' : 'full'));
      },
      update: ({ where, data }: { where: { id: string }; data: Partial<FakeUser> }) => {
        const user = users.find((u) => u.id === where.id);
        if (!user) throw new Error('user not found');
        Object.assign(user, data);
        return Promise.resolve(user);
      },
    },
    userSession: {
      create: ({ data }: { data: FakeSession }) => {
        const session: FakeSession = { ...data, revokedAt: data.revokedAt ?? null };
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
              ? withHospitalAccess(user, 'idOnly')
              : user,
        });
      },
      update: ({ where, data }: { where: { id: string }; data: Partial<FakeSession> }) => {
        const session = sessions.find((s) => s.id === where.id);
        if (!session) throw new Error('session not found');
        Object.assign(session, data);
        return Promise.resolve(session);
      },
      updateMany: ({
        where,
        data,
      }: {
        where: { userId?: string; refreshTokenHash?: string; revokedAt?: null };
        data: Partial<FakeSession>;
      }) => {
        const matches = sessions.filter(
          (s) =>
            (where.userId === undefined || s.userId === where.userId) &&
            (where.refreshTokenHash === undefined ||
              s.refreshTokenHash === where.refreshTokenHash) &&
            (where.revokedAt !== null || s.revokedAt === null),
        );
        matches.forEach((s) => Object.assign(s, data));
        return Promise.resolve({ count: matches.length });
      },
    },
    $transaction: (operations: Array<Promise<unknown>>) => Promise.all(operations),
  };

  return { prisma: prisma as unknown as PrismaService, sessions, hospitals };
}

interface UserFindArgs {
  where: { id?: string; email?: string };
  include?: { hospitalAccess?: boolean | { select?: unknown; include?: unknown } };
}

interface SessionFindArgs {
  where: { id?: string; refreshTokenHash?: string };
  include?: { user?: boolean | { include?: unknown } };
}

function createTokenService(): TokenService {
  const config = {
    get: (key: string) => (key === 'app.jwt' ? JWT_CONFIG : undefined),
  } as unknown as ConfigService;
  return new TokenService(new JwtService({}), config);
}

/** Asserts the thrown error is an AppException carrying the expected code. */
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

describe('AuthService', () => {
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await argonHash(PASSWORD);
  });

  function buildUsers(): FakeUser[] {
    const base = { passwordHash, lastLoginAt: null };
    return [
      {
        id: 'user-doctor',
        email: 'doctor@test.local',
        username: 'doctor',
        firstName: 'Test',
        lastName: 'Doktor',
        role: UserRole.DOCTOR,
        status: UserStatus.ACTIVE,
        ...base,
      },
      {
        id: 'user-reporter',
        email: 'reporter@test.local',
        username: 'reporter',
        firstName: 'Test',
        lastName: 'Raportor',
        role: UserRole.REPORTER,
        status: UserStatus.ACTIVE,
        ...base,
      },
      {
        id: 'user-operation',
        email: 'operation@test.local',
        username: 'operation',
        firstName: 'Test',
        lastName: 'Operasyon',
        role: UserRole.OPERATION,
        status: UserStatus.ACTIVE,
        ...base,
      },
      {
        id: 'user-manager',
        email: 'manager@test.local',
        username: 'manager',
        firstName: 'Test',
        lastName: 'Yonetici',
        role: UserRole.MANAGER,
        status: UserStatus.ACTIVE,
        ...base,
      },
      {
        id: 'user-inactive',
        email: 'inactive@test.local',
        username: 'inactive',
        firstName: 'Pasif',
        lastName: 'Kullanici',
        role: UserRole.DOCTOR,
        status: UserStatus.INACTIVE,
        ...base,
      },
      {
        id: 'user-suspended',
        email: 'suspended@test.local',
        username: 'suspended',
        firstName: 'Askiya',
        lastName: 'Alinmis',
        role: UserRole.DOCTOR,
        status: UserStatus.SUSPENDED,
        ...base,
      },
    ];
  }

  function createService() {
    const users = buildUsers();
    const access = [
      { userId: 'user-doctor', hospitalId: 'hospital-1' },
      { userId: 'user-reporter', hospitalId: 'hospital-1' },
      { userId: 'user-manager', hospitalId: 'hospital-1' },
      { userId: 'user-manager', hospitalId: 'hospital-2' },
    ];
    const { prisma, sessions } = createFakePrisma(users, access);
    const tokenService = createTokenService();
    const service = new AuthService(prisma, tokenService, new AppLogger('error'));

    return { service, tokenService, users, sessions };
  }

  describe('login', () => {
    it.each([
      ['doctor@test.local', UserRole.DOCTOR],
      ['reporter@test.local', UserRole.REPORTER],
      ['operation@test.local', UserRole.OPERATION],
      ['manager@test.local', UserRole.MANAGER],
    ])('authenticates %s', async (email, role) => {
      const { service, tokenService } = createService();

      const result = await service.login({ email, password: PASSWORD });

      expect(result.user).toMatchObject({ email, role, status: UserStatus.ACTIVE });
      expect(result.expiresIn).toBe(900);
      expect(tokenService.verifyAccessToken(result.accessToken)).toMatchObject({ role });
    });

    it('never returns the password hash', async () => {
      const { service } = createService();

      const result = await service.login({ email: 'doctor@test.local', password: PASSWORD });

      expect(result.user).not.toHaveProperty('passwordHash');
      expect(JSON.stringify(result.user)).not.toContain('$argon2');
    });

    it('accepts a differently cased email', async () => {
      const { service } = createService();

      await expect(
        service.login({ email: '  DOCTOR@Test.Local ', password: PASSWORD }),
      ).resolves.toMatchObject({ user: { email: 'doctor@test.local' } });
    });

    it('rejects a wrong password without creating a session', async () => {
      const { service, sessions } = createService();

      await expectAppError(
        service.login({ email: 'doctor@test.local', password: 'wrong-password' }),
        'INVALID_CREDENTIALS',
      );
      expect(sessions).toHaveLength(0);
    });

    it('does not reveal whether the account exists', async () => {
      const { service } = createService();

      const unknown = await expectAppError(
        service.login({ email: 'nobody@test.local', password: PASSWORD }),
        'INVALID_CREDENTIALS',
      );
      const wrongPassword = await expectAppError(
        service.login({ email: 'doctor@test.local', password: 'wrong-password' }),
        'INVALID_CREDENTIALS',
      );

      expect(unknown.message).toBe(wrongPassword.message);
      expect(unknown.getStatus()).toBe(wrongPassword.getStatus());
      expect(unknown.getStatus()).toBe(401);
    });

    it('rejects an inactive account after the password matched', async () => {
      const { service, sessions } = createService();

      const error = await expectAppError(
        service.login({ email: 'inactive@test.local', password: PASSWORD }),
        'USER_INACTIVE',
      );

      expect(error.getStatus()).toBe(403);
      expect(sessions).toHaveLength(0);
    });

    it('rejects a suspended account', async () => {
      const { service } = createService();

      const error = await expectAppError(
        service.login({ email: 'suspended@test.local', password: PASSWORD }),
        'USER_SUSPENDED',
      );

      expect(error.getStatus()).toBe(403);
    });

    it('reports an unknown email the same way as a disabled one', async () => {
      const { service } = createService();

      // Wrong password on a disabled account must still look like bad
      // credentials, not like "this account exists but is disabled".
      await expectAppError(
        service.login({ email: 'inactive@test.local', password: 'wrong-password' }),
        'INVALID_CREDENTIALS',
      );
    });

    it('stores only the hash of the refresh token, with session metadata', async () => {
      const { service, sessions, tokenService } = createService();

      const result = await service.login(
        { email: 'doctor@test.local', password: PASSWORD },
        { ipAddress: '203.0.113.7', userAgent: 'jest-agent' },
      );

      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toMatchObject({
        userId: 'user-doctor',
        ipAddress: '203.0.113.7',
        userAgent: 'jest-agent',
        revokedAt: null,
      });
      expect(sessions[0].refreshTokenHash).toBe(
        tokenService.hashRefreshToken(result.refreshToken),
      );
      expect(sessions[0].refreshTokenHash).not.toBe(result.refreshToken);
      expect(sessions[0].expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('truncates an oversized user agent instead of failing the login', async () => {
      const { service, sessions } = createService();

      await service.login(
        { email: 'doctor@test.local', password: PASSWORD },
        { userAgent: 'x'.repeat(2000) },
      );

      expect(sessions[0].userAgent).toHaveLength(512);
    });

    it('records lastLoginAt', async () => {
      const { service, users } = createService();

      await service.login({ email: 'doctor@test.local', password: PASSWORD });

      expect(users.find((u) => u.id === 'user-doctor')?.lastLoginAt).toBeInstanceOf(Date);
    });
  });

  describe('refresh', () => {
    it('rotates the session and issues a new token pair', async () => {
      const { service, sessions } = createService();
      const login = await service.login({ email: 'doctor@test.local', password: PASSWORD });

      const refreshed = await service.refresh(login.refreshToken);

      expect(refreshed.refreshToken).not.toBe(login.refreshToken);
      expect(refreshed.expiresIn).toBe(900);
      expect(sessions).toHaveLength(2);
      expect(sessions[0].revokedAt).toBeInstanceOf(Date);
      expect(sessions[1].revokedAt).toBeNull();
    });

    it('rejects a missing refresh token', async () => {
      const { service } = createService();

      await expectAppError(service.refresh(undefined), 'UNAUTHORIZED');
    });

    it('rejects a syntactically invalid refresh token', async () => {
      const { service } = createService();

      await expectAppError(service.refresh('not-a-token'), 'UNAUTHORIZED');
    });

    it('rejects a well-formed token with no matching session', async () => {
      const { service, tokenService } = createService();
      const orphan = tokenService.signRefreshToken({
        userId: 'user-doctor',
        sessionId: 'never-created',
      });

      await expectAppError(service.refresh(orphan), 'UNAUTHORIZED');
    });

    it('revokes every session when a rotated token is replayed', async () => {
      const { service, sessions } = createService();
      const login = await service.login({ email: 'doctor@test.local', password: PASSWORD });
      await service.refresh(login.refreshToken);

      await expectAppError(service.refresh(login.refreshToken), 'UNAUTHORIZED');

      expect(sessions).toHaveLength(2);
      expect(sessions.every((session) => session.revokedAt !== null)).toBe(true);
    });

    it('rejects an expired session', async () => {
      const { service, sessions } = createService();
      const login = await service.login({ email: 'doctor@test.local', password: PASSWORD });
      sessions[0].expiresAt = new Date(Date.now() - 1000);

      await expectAppError(service.refresh(login.refreshToken), 'UNAUTHORIZED');
    });

    it('stops refreshing once the account is deactivated', async () => {
      const { service, users } = createService();
      const login = await service.login({ email: 'doctor@test.local', password: PASSWORD });

      const doctor = users.find((u) => u.id === 'user-doctor');
      if (doctor) doctor.status = UserStatus.INACTIVE;

      await expectAppError(service.refresh(login.refreshToken), 'USER_INACTIVE');
    });
  });

  describe('logout', () => {
    it('revokes the session behind the token', async () => {
      const { service, sessions } = createService();
      const login = await service.login({ email: 'doctor@test.local', password: PASSWORD });

      await service.logout(login.refreshToken);

      expect(sessions[0].revokedAt).toBeInstanceOf(Date);
    });

    it('makes the revoked refresh token unusable', async () => {
      const { service } = createService();
      const login = await service.login({ email: 'doctor@test.local', password: PASSWORD });

      await service.logout(login.refreshToken);

      await expectAppError(service.refresh(login.refreshToken), 'UNAUTHORIZED');
    });

    it('is a no-op without a token and is safe to repeat', async () => {
      const { service } = createService();
      const login = await service.login({ email: 'doctor@test.local', password: PASSWORD });

      await expect(service.logout(undefined)).resolves.toBeUndefined();
      await expect(service.logout(login.refreshToken)).resolves.toBeUndefined();
      await expect(service.logout(login.refreshToken)).resolves.toBeUndefined();
    });
  });

  describe('getCurrentUser', () => {
    it('returns the profile with authorized hospitals and no secrets', async () => {
      const { service } = createService();

      const me = await service.getCurrentUser('user-manager');

      expect(me).toMatchObject({
        id: 'user-manager',
        email: 'manager@test.local',
        role: UserRole.MANAGER,
        status: UserStatus.ACTIVE,
      });
      expect(me.hospitals.map((h) => h.code).sort()).toEqual(['OTHER_HOSPITAL', 'TEST_HOSPITAL']);
      expect(me).not.toHaveProperty('passwordHash');
    });

    it('returns an empty hospital list rather than failing', async () => {
      const { service } = createService();

      await expect(service.getCurrentUser('user-operation')).resolves.toMatchObject({
        hospitals: [],
      });
    });

    it('rejects an unknown user id', async () => {
      const { service } = createService();

      await expectAppError(service.getCurrentUser('user-missing'), 'UNAUTHORIZED');
    });
  });

  describe('resolveAuthenticatedUser', () => {
    /** Logs in and returns the session id the access token would carry. */
    async function loginAndGetSessionId(email: string) {
      const context = createService();
      await context.service.login({ email, password: PASSWORD });
      return { ...context, sessionId: context.sessions[0].id };
    }

    it('resolves the principal with its hospital scope', async () => {
      const { service, sessionId } = await loginAndGetSessionId('manager@test.local');

      await expect(
        service.resolveAuthenticatedUser('user-manager', sessionId),
      ).resolves.toMatchObject({
        id: 'user-manager',
        role: UserRole.MANAGER,
        sessionId,
        hospitalIds: ['hospital-1', 'hospital-2'],
      });
    });

    it.each([UserStatus.INACTIVE, UserStatus.SUSPENDED])(
      'fails closed for a %s account',
      async (status) => {
        const { service, users, sessionId } = await loginAndGetSessionId('doctor@test.local');
        const doctor = users.find((u) => u.id === 'user-doctor');
        if (doctor) doctor.status = status;

        await expectAppError(
          service.resolveAuthenticatedUser('user-doctor', sessionId),
          'UNAUTHORIZED',
        );
      },
    );

    it('rejects a session that no longer exists', async () => {
      const { service } = createService();

      await expectAppError(
        service.resolveAuthenticatedUser('user-doctor', 'session-missing'),
        'UNAUTHORIZED',
      );
    });

    it('rejects a session belonging to a different user', async () => {
      const { service, sessionId } = await loginAndGetSessionId('doctor@test.local');

      await expectAppError(
        service.resolveAuthenticatedUser('user-manager', sessionId),
        'UNAUTHORIZED',
      );
    });

    it('stops accepting the access token as soon as the session is revoked', async () => {
      const { service, sessions, sessionId } = await loginAndGetSessionId('doctor@test.local');

      await expect(
        service.resolveAuthenticatedUser('user-doctor', sessionId),
      ).resolves.toMatchObject({ id: 'user-doctor' });

      sessions[0].revokedAt = new Date();

      await expectAppError(
        service.resolveAuthenticatedUser('user-doctor', sessionId),
        'UNAUTHORIZED',
      );
    });

    it('rejects an expired session', async () => {
      const { service, sessions, sessionId } = await loginAndGetSessionId('doctor@test.local');
      sessions[0].expiresAt = new Date(Date.now() - 1000);

      await expectAppError(
        service.resolveAuthenticatedUser('user-doctor', sessionId),
        'UNAUTHORIZED',
      );
    });
  });
});
