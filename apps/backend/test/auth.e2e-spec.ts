import request from 'supertest';
import { REFRESH_COOKIE_NAME } from '../src/auth/auth.constants';
import {
  cookieValue,
  createTestHarness,
  readRefreshCookie,
  TEST_PASSWORD,
  type TestHarness,
} from './fixtures/auth-test-harness';

/**
 * Auth HTTP contract (TASK_QUEUE BACKEND-006, docs/API_CONTRACT.md 17-21).
 *
 * Infrastructure is stubbed by the shared harness; routing, guards, validation,
 * cookies and the error envelope are exercised for real.
 */
describe('Auth (e2e)', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  const app = () => harness.app.getHttpServer();
  const login = (email: string, password = TEST_PASSWORD) => harness.login(email, password);

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
      const response = await request(app())
        .post('/api/v1/auth/login')
        .send({ email: 'not-an-email' })
        .expect(422);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details.fields).toHaveProperty('email');
      expect(response.body.error.details.fields).toHaveProperty('password');
    });

    it('rejects unknown body properties instead of ignoring them', async () => {
      const response = await request(app())
        .post('/api/v1/auth/login')
        .send({ email: 'doctor@test.local', password: TEST_PASSWORD, role: 'MANAGER' })
        .expect(422);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /auth/me', () => {
    it('returns the profile with authorized hospitals', async () => {
      const loginResponse = await login('doctor@test.local').expect(200);

      const response = await request(app())
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
      const call = request(app()).get('/api/v1/auth/me');
      if (header) call.set('Authorization', header);

      const response = await call.expect(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects a refresh token used as an access token', async () => {
      const loginResponse = await login('doctor@test.local').expect(200);
      const refreshToken = cookieValue(readRefreshCookie(loginResponse) as string).split('=')[1];

      const response = await request(app())
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

      const response = await request(app())
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

      const refreshResponse = await request(app())
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookieValue(readRefreshCookie(loginResponse) as string))
        .expect(200);

      await request(app())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${refreshResponse.body.data.accessToken}`)
        .expect(200);
    });

    it('retires the access token issued by the rotated session', async () => {
      const loginResponse = await login('doctor@test.local').expect(200);
      const oldAccessToken = loginResponse.body.data.accessToken;

      await request(app())
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookieValue(readRefreshCookie(loginResponse) as string))
        .expect(200);

      // Documented contract: after refreshing, the client must use the new
      // access token. The old one belongs to the now-revoked session.
      await request(app())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${oldAccessToken}`)
        .expect(401);
    });

    it('rejects a request without the cookie', async () => {
      const response = await request(app()).post('/api/v1/auth/refresh').expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects a rotated cookie being replayed', async () => {
      const loginResponse = await login('operation@test.local').expect(200);
      const original = cookieValue(readRefreshCookie(loginResponse) as string);

      await request(app())
        .post('/api/v1/auth/refresh')
        .set('Cookie', original)
        .expect(200);

      const replay = await request(app())
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

      const logoutResponse = await request(app())
        .post('/api/v1/auth/logout')
        .set('Cookie', cookie)
        .expect(204);

      const cleared = readRefreshCookie(logoutResponse) as string;
      expect(cleared).toContain(`${REFRESH_COOKIE_NAME}=;`);

      await request(app())
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie)
        .expect(401);
    });

    it('succeeds without a cookie so a stale client can still clear its state', async () => {
      await request(app()).post('/api/v1/auth/logout').expect(204);
    });

    it('invalidates the already-issued access token immediately', async () => {
      const loginResponse = await login('manager@test.local').expect(200);
      const accessToken = loginResponse.body.data.accessToken;
      const cookie = cookieValue(readRefreshCookie(loginResponse) as string);

      await request(app())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      await request(app())
        .post('/api/v1/auth/logout')
        .set('Cookie', cookie)
        .expect(204);

      // The token is still cryptographically valid; the revoked session is what
      // stops it, so logout does not leave a usable window.
      const response = await request(app())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('global guard', () => {
    it('keeps the health endpoint public', async () => {
      await request(app()).get('/api/v1/health').expect(200);
    });

    it('still returns 404 (not 401) for an unknown route', async () => {
      const response = await request(app()).get('/api/v1/nope').expect(404);

      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });
});
