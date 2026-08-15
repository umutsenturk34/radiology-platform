import request from 'supertest';
import { createTestHarness, type TestHarness } from './fixtures/auth-test-harness';

/**
 * Dev-tools gating (TASK_QUEUE BACKEND-050, docs/API_CONTRACT.md section 93).
 *
 * Two independent conditions must hold: `DEV_TOOLS_ENABLED=true` and the
 * MANAGER role. Each is verified on its own, so neither can be the only thing
 * standing between production and these endpoints.
 *
 * The flag is read when the module compiles, so each suite boots its own app.
 */

const ROUTES = [
  ['post', '/api/v1/dev-tools/hl7/first'],
  ['post', '/api/v1/dev-tools/hl7/second'],
  ['post', '/api/v1/dev-tools/studies/11111111-1111-4111-8111-111111111111/images-available'],
] as const;

async function bootWithFlag(enabled: boolean): Promise<TestHarness> {
  process.env.DEV_TOOLS_ENABLED = enabled ? 'true' : 'false';
  return createTestHarness();
}

describe('Dev tools (e2e) — DEV_TOOLS_ENABLED=false', () => {
  let harness: TestHarness;
  let managerToken: string;
  const originalFlag = process.env.DEV_TOOLS_ENABLED;

  beforeAll(async () => {
    harness = await bootWithFlag(false);
    managerToken = await harness.accessTokenFor('manager@test.local');
  });

  afterAll(async () => {
    await harness.close();
    process.env.DEV_TOOLS_ENABLED = originalFlag;
  });

  it.each(ROUTES)('refuses %s %s even for a Manager', async (_method, path) => {
    const response = await request(harness.app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ hospitalId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })
      .expect(403);

    expect(response.body.error.code).toBe('DEV_TOOLS_DISABLED');
  });

  it('still requires authentication', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/v1/dev-tools/hl7/first')
      .send({})
      .expect(401);

    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('Dev tools (e2e) — DEV_TOOLS_ENABLED=true', () => {
  let harness: TestHarness;
  const tokens: Record<string, string> = {};
  const originalFlag = process.env.DEV_TOOLS_ENABLED;

  beforeAll(async () => {
    harness = await bootWithFlag(true);
    for (const role of ['doctor', 'reporter', 'operation', 'manager']) {
      tokens[role] = await harness.accessTokenFor(`${role}@test.local`);
    }
  });

  afterAll(async () => {
    await harness.close();
    process.env.DEV_TOOLS_ENABLED = originalFlag;
  });

  it.each(['doctor', 'reporter', 'operation'])(
    'still refuses a %s: the flag alone is not access',
    async (role) => {
      const response = await request(harness.app.getHttpServer())
        .post('/api/v1/dev-tools/hl7/first')
        .set('Authorization', `Bearer ${tokens[role]}`)
        .send({ hospitalId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })
        .expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN');
    },
  );

  it('lets a Manager past both gates and into request validation', async () => {
    // A 422 proves the request reached the handler: the guards passed and the
    // body was rejected on its own merits.
    const response = await request(harness.app.getHttpServer())
      .post('/api/v1/dev-tools/hl7/first')
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ externalPatientId: 'TEST-001' })
      .expect(422);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details.fields).toHaveProperty('hospitalId');
  });

  it('rejects a non-UUID hospitalId', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/v1/dev-tools/hl7/second')
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ hospitalId: 'not-a-uuid', accessionNumber: 'ACC-1' })
      .expect(422);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a malformed studyId on the images-available route', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/v1/dev-tools/studies/not-a-uuid/images-available')
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({})
      .expect(422);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});
