import request from 'supertest';
import { createTestHarness, type TestHarness } from './fixtures/auth-test-harness';
import { RolesProbeController } from './fixtures/roles-probe.controller';

/**
 * Role authorization over real HTTP (TASK_QUEUE BACKEND-007).
 *
 * The routes come from a test-only probe controller that mirrors the role
 * requirements of the endpoints the task queue defines, so the guard is
 * verified before those endpoints are implemented.
 */
describe('RolesGuard (e2e)', () => {
  let harness: TestHarness;
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    harness = await createTestHarness({ extraControllers: [RolesProbeController] });

    for (const role of ['doctor', 'reporter', 'operation', 'manager']) {
      tokens[role] = await harness.accessTokenFor(`${role}@test.local`);
    }
  });

  afterAll(async () => {
    await harness.close();
  });

  const get = (path: string, role?: string) => {
    const call = request(harness.app.getHttpServer()).get(path);
    return role ? call.set('Authorization', `Bearer ${tokens[role]}`) : call;
  };

  const post = (path: string, role?: string) => {
    const call = request(harness.app.getHttpServer()).post(path);
    return role ? call.set('Authorization', `Bearer ${tokens[role]}`) : call;
  };

  describe('doctor-only action (finalize)', () => {
    it('allows a Doctor', async () => {
      const response = await post('/api/v1/probe/finalize', 'doctor').expect(201);
      expect(response.body.data).toMatchObject({ action: 'finalize', by: 'DOCTOR' });
    });

    it.each(['reporter', 'operation', 'manager'])('refuses a %s with 403', async (role) => {
      const response = await post('/api/v1/probe/finalize', role).expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN');
      expect(response.body.error.details).toEqual({});
    });
  });

  describe('manager-only action', () => {
    it('allows a Manager', async () => {
      await get('/api/v1/probe/manager/users', 'manager').expect(200);
    });

    it.each(['doctor', 'reporter', 'operation'])('refuses a %s with 403', async (role) => {
      const response = await get('/api/v1/probe/manager/users', role).expect(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('operation or manager action (HBYS retry)', () => {
    it.each(['operation', 'manager'])('allows a %s', async (role) => {
      await post('/api/v1/probe/hbys-retry', role).expect(201);
    });

    it.each(['doctor', 'reporter'])('refuses a %s with 403', async (role) => {
      const response = await post('/api/v1/probe/hbys-retry', role).expect(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('route without a role requirement', () => {
    it.each(['doctor', 'reporter', 'operation', 'manager'])('allows a %s', async (role) => {
      await get('/api/v1/probe/any-role', role).expect(200);
    });

    it('still requires authentication', async () => {
      const response = await get('/api/v1/probe/any-role').expect(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('authentication precedes the role check', () => {
    it('answers 401, not 403, when no token is supplied', async () => {
      const response = await post('/api/v1/probe/finalize').expect(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('answers 401 for a malformed token', async () => {
      const response = await post('/api/v1/probe/finalize')
        .set('Authorization', 'Bearer not-a-jwt')
        .expect(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('ignores a role claimed in the request body', async () => {
      // Role comes from the verified token and the database, never from input.
      const response = await post('/api/v1/probe/finalize', 'reporter')
        .send({ role: 'DOCTOR' })
        .expect(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });

  it('leaves an explicitly public route open', async () => {
    await get('/api/v1/probe/public').expect(200);
  });
});
