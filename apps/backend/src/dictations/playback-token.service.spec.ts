import type { ConfigService } from '@nestjs/config';
import { PlaybackTokenService } from './playback-token.service';
import { AppException } from '../common/errors/app.exception';
import type { JwtConfig } from '../config/configuration';

const JWT_CONFIG: JwtConfig = {
  accessSecret: 'access-secret-that-is-long-enough-for-tests',
  refreshSecret: 'refresh-secret-that-is-long-enough-for-tests',
  accessTtlSeconds: 900,
  refreshTtlSeconds: 604800,
};

const DICTATION_ID = 'dictation-1';
const USER_ID = 'user-doctor';

function createService(overrides: Partial<JwtConfig> = {}): PlaybackTokenService {
  const jwt = { ...JWT_CONFIG, ...overrides };
  const config = {
    get: (key: string) => (key === 'app.jwt' ? jwt : undefined),
  } as unknown as ConfigService;

  return new PlaybackTokenService(config);
}

function expectRejected(fn: () => unknown): AppException {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).code).toBe('UNAUTHORIZED');
    return error as AppException;
  }
  throw new Error('Expected the token to be rejected');
}

describe('PlaybackTokenService', () => {
  it('round-trips a token and returns the user it was issued to', () => {
    const service = createService();

    const { token, expiresAt } = service.issue(DICTATION_ID, USER_ID, 300);

    expect(service.verify(token, DICTATION_ID)).toBe(USER_ID);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('refuses a token issued for a different dictation', () => {
    const service = createService();
    const { token } = service.issue(DICTATION_ID, USER_ID, 300);

    // Otherwise one playback link would open every recording.
    expectRejected(() => service.verify(token, 'dictation-2'));
  });

  it('refuses a token whose user was swapped', () => {
    const service = createService();
    const { token } = service.issue(DICTATION_ID, USER_ID, 300);
    const [expiresAt, , signature] = token.split('.');

    expectRejected(() => service.verify(`${expiresAt}.someone-else.${signature}`, DICTATION_ID));
  });

  it('refuses a token whose expiry was extended', () => {
    const service = createService();
    const { token } = service.issue(DICTATION_ID, USER_ID, 300);
    const [expiresAt, userId, signature] = token.split('.');
    const later = String(Number(expiresAt) + 60_000);

    expectRejected(() => service.verify(`${later}.${userId}.${signature}`, DICTATION_ID));
  });

  it('refuses an expired token', () => {
    const service = createService();
    const { token } = service.issue(DICTATION_ID, USER_ID, 1);

    jest.useFakeTimers().setSystemTime(Date.now() + 5000);
    try {
      expectRejected(() => service.verify(token, DICTATION_ID));
    } finally {
      jest.useRealTimers();
    }
  });

  it.each([
    ['no token', undefined],
    ['an empty token', ''],
    ['a malformed token', 'garbage'],
    ['a token with a non-numeric expiry', 'later.user.signature'],
  ])('refuses %s', (_label, token) => {
    expectRejected(() => createService().verify(token, DICTATION_ID));
  });

  it('refuses a token signed with a different secret', () => {
    const issuer = createService();
    const other = createService({ accessSecret: 'a-completely-different-access-secret-value' });
    const { token } = issuer.issue(DICTATION_ID, USER_ID, 300);

    expectRejected(() => other.verify(token, DICTATION_ID));
  });

  it('refuses to construct without JWT configuration', () => {
    const config = { get: () => undefined } as unknown as ConfigService;

    expect(() => new PlaybackTokenService(config)).toThrow(/JWT configuration is missing/);
  });
});
