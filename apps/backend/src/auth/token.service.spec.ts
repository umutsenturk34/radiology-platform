import { JwtService } from '@nestjs/jwt';
import type { ConfigService } from '@nestjs/config';
import { UserRole } from '@radiology/shared';
import { TokenService } from './token.service';
import type { JwtConfig } from '../config/configuration';
import { AppException } from '../common/errors/app.exception';

const JWT_CONFIG: JwtConfig = {
  accessSecret: 'access-secret-that-is-long-enough-for-tests',
  refreshSecret: 'refresh-secret-that-is-long-enough-for-tests',
  accessTtlSeconds: 900,
  refreshTtlSeconds: 604800,
};

function createTokenService(overrides: Partial<JwtConfig> = {}): TokenService {
  const jwtConfig = { ...JWT_CONFIG, ...overrides };
  const config = {
    get: (key: string) => (key === 'app.jwt' ? jwtConfig : undefined),
  } as unknown as ConfigService;

  return new TokenService(new JwtService({}), config);
}

describe('TokenService', () => {
  it('round-trips an access token with its claims', () => {
    const service = createTokenService();

    const token = service.signAccessToken({
      userId: 'user-1',
      sessionId: 'session-1',
      role: UserRole.DOCTOR,
    });

    expect(service.verifyAccessToken(token)).toMatchObject({
      sub: 'user-1',
      sid: 'session-1',
      role: UserRole.DOCTOR,
      typ: 'access',
    });
  });

  it('round-trips a refresh token', () => {
    const service = createTokenService();

    const token = service.signRefreshToken({ userId: 'user-1', sessionId: 'session-1' });

    expect(service.verifyRefreshToken(token)).toMatchObject({
      sub: 'user-1',
      sid: 'session-1',
      typ: 'refresh',
    });
  });

  it('refuses an access token presented as a refresh token and vice versa', () => {
    const service = createTokenService();

    const access = service.signAccessToken({
      userId: 'user-1',
      sessionId: 'session-1',
      role: UserRole.DOCTOR,
    });
    const refresh = service.signRefreshToken({ userId: 'user-1', sessionId: 'session-1' });

    // Both secrets differ, so this also proves the secrets are not interchangeable.
    expect(() => service.verifyRefreshToken(access)).toThrow(AppException);
    expect(() => service.verifyAccessToken(refresh)).toThrow(AppException);
  });

  it('rejects a token signed with a different secret', () => {
    const issuer = createTokenService();
    const other = createTokenService({ accessSecret: 'a-completely-different-access-secret-value' });

    const token = issuer.signAccessToken({
      userId: 'user-1',
      sessionId: 'session-1',
      role: UserRole.REPORTER,
    });

    expect(() => other.verifyAccessToken(token)).toThrow(/Invalid or expired token/);
  });

  it('rejects an expired token', () => {
    const service = createTokenService({ accessTtlSeconds: 1 });

    const token = service.signAccessToken({
      userId: 'user-1',
      sessionId: 'session-1',
      role: UserRole.DOCTOR,
    });

    jest.useFakeTimers().setSystemTime(Date.now() + 5000);
    try {
      expect(() => service.verifyAccessToken(token)).toThrow(/Invalid or expired token/);
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejects a tampered token', () => {
    const service = createTokenService();

    const token = service.signAccessToken({
      userId: 'user-1',
      sessionId: 'session-1',
      role: UserRole.REPORTER,
    });
    const [header, , signature] = token.split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({ sub: 'user-1', sid: 'session-1', role: 'MANAGER', typ: 'access' }),
    ).toString('base64url');

    expect(() => service.verifyAccessToken(`${header}.${forgedPayload}.${signature}`)).toThrow(
      /Invalid or expired token/,
    );
  });

  it('never leaks why verification failed', () => {
    const service = createTokenService();

    expect(() => service.verifyAccessToken('not-a-jwt')).toThrow('Invalid or expired token.');
  });

  it('hashes refresh tokens deterministically and does not embed the token', () => {
    const service = createTokenService();
    const token = service.signRefreshToken({ userId: 'user-1', sessionId: 'session-1' });

    const hash = service.hashRefreshToken(token);

    expect(hash).toBe(service.hashRefreshToken(token));
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain(token);
    expect(service.hashRefreshToken(`${token}x`)).not.toBe(hash);
  });

  it('exposes the configured TTLs', () => {
    const service = createTokenService();

    expect(service.accessTtlSeconds).toBe(900);
    expect(service.refreshTtlSeconds).toBe(604800);
  });

  it('refuses to construct without JWT configuration', () => {
    const config = { get: () => undefined } as unknown as ConfigService;

    expect(() => new TokenService(new JwtService({}), config)).toThrow(
      /JWT configuration is missing/,
    );
  });
});
