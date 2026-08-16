import request from 'supertest';
import { createTestHarness, type TestHarness } from './fixtures/auth-test-harness';
import { STUDY_IN_SCOPE_OLDEST } from './fixtures/study-fixtures';
import { HbysDeliveryService } from '../src/integrations/hbys/hbys-delivery.service';
import { MockHbysAdapter, MockHbysMode } from '../src/integrations/hbys/mock-hbys.adapter';

/**
 * HBYS delivery over real HTTP plus the worker path
 * (TASK_QUEUE BACKEND-033, 035, 036, 037, 038).
 *
 * BullMQ is replaced by a recorder and the attempts are driven explicitly, so
 * the retry behaviour is exercised deterministically instead of by waiting out
 * the real 30s / 2m / 5m schedule (CLAUDE.md section 27).
 */
describe('HBYS delivery (e2e)', () => {
  let harness: TestHarness;
  let deliveries: HbysDeliveryService;
  let mockAdapter: MockHbysAdapter;
  const tokens: Record<string, string> = {};
  const STUDY = STUDY_IN_SCOPE_OLDEST.id;

  beforeEach(async () => {
    harness = await createTestHarness({
      withRedis: true,
      studies: [{ ...STUDY_IN_SCOPE_OLDEST, status: 'WAITING_TRANSCRIPTION' }],
      hospitalAccess: [
        { userId: 'u-doctor', hospitalId: STUDY_IN_SCOPE_OLDEST.hospitalId },
        { userId: 'u-reporter', hospitalId: STUDY_IN_SCOPE_OLDEST.hospitalId },
        { userId: 'u-operation', hospitalId: STUDY_IN_SCOPE_OLDEST.hospitalId },
      ],
    });

    deliveries = harness.app.get(HbysDeliveryService);
    mockAdapter = harness.app.get(MockHbysAdapter);
    await mockAdapter.setMode(MockHbysMode.SUCCESS);

    for (const [key, email] of [
      ['doctor', 'doctor@test.local'],
      ['reporter', 'reporter@test.local'],
      ['operation', 'operation@test.local'],
      ['manager', 'manager@test.local'],
    ] as const) {
      tokens[key] = await harness.accessTokenFor(email);
    }
  });

  afterEach(async () => {
    await harness.close();
  });

  const server = () => harness.app.getHttpServer();
  const post = (path: string, role: string, body?: object) =>
    request(server())
      .post(path)
      .set('Authorization', `Bearer ${tokens[role]}`)
      .send(body ?? {});
  const get = (path: string, role: string) =>
    request(server()).get(path).set('Authorization', `Bearer ${tokens[role]}`);

  /** Runs the reporter and doctor halves so a delivery exists. */
  async function finalize(): Promise<string> {
    await post(`/api/v1/studies/${STUDY}/start-transcription`, 'reporter').expect(200);
    await post(`/api/v1/studies/${STUDY}/submit-report`, 'reporter', {
      content: 'Rapor metni.',
    }).expect(200);
    await post(`/api/v1/studies/${STUDY}/start-approval`, 'doctor').expect(200);

    const response = await post(`/api/v1/studies/${STUDY}/finalize`, 'doctor').expect(200);
    return response.body.data.hbysDelivery.id as string;
  }

  /** Runs attempts until the delivery stops asking to be retried. */
  async function runAttempts(deliveryId: string, max = 10): Promise<number> {
    for (let attempt = 1; attempt <= max; attempt += 1) {
      const { retry } = await deliveries.processDelivery(deliveryId, attempt);
      if (!retry) return attempt;
    }
    throw new Error('The delivery never stopped retrying');
  }

  describe('queueing', () => {
    it('queues exactly one job for the finalized report', async () => {
      const deliveryId = await finalize();

      expect(harness.queuedJobs).toHaveLength(1);
      expect(harness.queuedJobs[0]).toMatchObject({
        name: 'send-report',
        data: { deliveryId },
      });
    });

    it('exposes the delivery on the study', async () => {
      const deliveryId = await finalize();

      const response = await get(`/api/v1/studies/${STUDY}/hbys-deliveries`, 'doctor').expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toMatchObject({
        id: deliveryId,
        status: 'PENDING',
        attemptCount: 0,
      });
    });
  });

  describe('SUCCESS mode', () => {
    it('sends on the first attempt and moves the study to HBYS_SENT', async () => {
      const deliveryId = await finalize();

      const attempts = await runAttempts(deliveryId);

      expect(attempts).toBe(1);
      expect(harness.hbysDeliveries[0]).toMatchObject({
        status: 'SENT',
        attemptCount: 1,
        lastErrorCode: null,
      });
      expect(harness.hbysDeliveries[0].externalReportId).toEqual(expect.any(String));
      expect(harness.studies[0]).toMatchObject({ status: 'HBYS_SENT' });
    });

    it('records the attempt and the audit entry', async () => {
      const deliveryId = await finalize();
      await runAttempts(deliveryId);

      expect(harness.hbysAttempts).toHaveLength(1);
      expect(harness.hbysAttempts[0]).toMatchObject({ attemptNumber: 1, status: 'SENT' });
      expect(harness.auditLogs.map((row) => row.eventType)).toContain('HBYS_DELIVERY_SENT');
    });

    it('does not send the same delivery twice', async () => {
      const deliveryId = await finalize();
      await runAttempts(deliveryId);

      // A duplicate job for an already-sent delivery must do nothing.
      const { retry } = await deliveries.processDelivery(deliveryId, 2);

      expect(retry).toBe(false);
      expect(harness.hbysAttempts).toHaveLength(1);
      expect(harness.hbysDeliveries[0]).toMatchObject({ status: 'SENT', attemptCount: 1 });
    });
  });

  describe('FAIL mode', () => {
    it('fails immediately without retrying a permanent rejection', async () => {
      const deliveryId = await finalize();
      await mockAdapter.setMode(MockHbysMode.FAIL);

      const attempts = await runAttempts(deliveryId);

      // Not retryable, so one attempt and no more.
      expect(attempts).toBe(1);
      expect(harness.hbysAttempts).toHaveLength(1);
      expect(harness.hbysDeliveries[0]).toMatchObject({
        status: 'FAILED',
        lastErrorCode: 'MOCK_HBYS_REJECTED',
      });
    });

    it('makes the failure visible on the study rather than hiding it', async () => {
      const deliveryId = await finalize();
      await mockAdapter.setMode(MockHbysMode.FAIL);
      await runAttempts(deliveryId);

      expect(harness.studies[0]).toMatchObject({ status: 'HBYS_FAILED' });
      expect(harness.auditLogs.map((row) => row.eventType)).toContain('HBYS_DELIVERY_FAILED');

      const listed = await get('/api/v1/studies?pool=HBYS_FAILED', 'operation').expect(200);
      expect(listed.body.data.map((item: { id: string }) => item.id)).toContain(STUDY);
    });
  });

  describe('TIMEOUT mode', () => {
    it('retries a timeout and fails only once the budget is spent', async () => {
      const deliveryId = await finalize();
      await mockAdapter.setMode(MockHbysMode.TIMEOUT);

      const attempts = await runAttempts(deliveryId);

      // Four attempts: the initial one plus the three configured retries.
      expect(attempts).toBe(deliveries.maxAttempts);
      expect(harness.hbysAttempts).toHaveLength(deliveries.maxAttempts);
      expect(harness.hbysAttempts.map((row) => row.attemptNumber)).toEqual([1, 2, 3, 4]);
      expect(harness.hbysDeliveries[0]).toMatchObject({
        status: 'FAILED',
        attemptCount: deliveries.maxAttempts,
        lastErrorCode: 'MOCK_HBYS_TIMEOUT',
      });
      expect(harness.studies[0]).toMatchObject({ status: 'HBYS_FAILED' });
    });

    it('keeps the delivery retryable between attempts, not failed', async () => {
      const deliveryId = await finalize();
      await mockAdapter.setMode(MockHbysMode.TIMEOUT);

      const first = await deliveries.processDelivery(deliveryId, 1);

      expect(first.retry).toBe(true);
      // Back to PENDING so the next attempt can claim it.
      expect(harness.hbysDeliveries[0]).toMatchObject({ status: 'PENDING', attemptCount: 1 });
      expect(harness.studies[0]).toMatchObject({ status: 'HBYS_PENDING' });
    });

    it('succeeds on a later attempt when the remote recovers', async () => {
      const deliveryId = await finalize();
      await mockAdapter.setMode(MockHbysMode.TIMEOUT);
      await deliveries.processDelivery(deliveryId, 1);

      await mockAdapter.setMode(MockHbysMode.SUCCESS);
      const second = await deliveries.processDelivery(deliveryId, 2);

      expect(second.retry).toBe(false);
      expect(harness.hbysDeliveries[0]).toMatchObject({ status: 'SENT', attemptCount: 2 });
      expect(harness.studies[0]).toMatchObject({ status: 'HBYS_SENT' });
      // Both attempts are kept.
      expect(harness.hbysAttempts.map((row) => row.status)).toEqual(['FAILED', 'SENT']);
    });
  });

  describe('manual retry', () => {
    async function failDelivery(): Promise<string> {
      const deliveryId = await finalize();
      await mockAdapter.setMode(MockHbysMode.FAIL);
      await runAttempts(deliveryId);
      return deliveryId;
    }

    it('re-queues a failed delivery and returns the study to HBYS_PENDING', async () => {
      const deliveryId = await failDelivery();
      harness.queuedJobs.length = 0;

      const response = await post(`/api/v1/hbys-deliveries/${deliveryId}/retry`, 'operation', {
        reason: 'Hastane sistemi tekrar ayakta.',
      }).expect(200);

      expect(response.body.data).toMatchObject({ id: deliveryId, status: 'PENDING' });
      expect(harness.studies[0]).toMatchObject({ status: 'HBYS_PENDING' });
      expect(harness.queuedJobs).toHaveLength(1);
    });

    it('preserves the earlier attempts and the report version', async () => {
      const deliveryId = await failDelivery();
      const reportVersionId = harness.hbysDeliveries[0].reportVersionId;

      await post(`/api/v1/hbys-deliveries/${deliveryId}/retry`, 'operation', {
        reason: 'tekrar dene',
      }).expect(200);

      // The failed attempt is still there; a retry adds to the history.
      expect(harness.hbysAttempts).toHaveLength(1);
      expect(harness.hbysDeliveries[0].reportVersionId).toBe(reportVersionId);
    });

    it('reaches HBYS_SENT once the remote accepts it', async () => {
      const deliveryId = await failDelivery();
      await post(`/api/v1/hbys-deliveries/${deliveryId}/retry`, 'operation', {
        reason: 'tekrar dene',
      }).expect(200);

      await mockAdapter.setMode(MockHbysMode.SUCCESS);
      // A manually retried delivery starts a fresh queue job, so its attempt
      // counter is 1 again.
      await deliveries.processDelivery(deliveryId, 1);

      expect(harness.hbysDeliveries[0]).toMatchObject({ status: 'SENT' });
      expect(harness.studies[0]).toMatchObject({ status: 'HBYS_SENT' });
      expect(harness.hbysAttempts).toHaveLength(2);
    });

    it('numbers the retried attempt after the earlier one', async () => {
      const deliveryId = await failDelivery();
      await post(`/api/v1/hbys-deliveries/${deliveryId}/retry`, 'operation', {
        reason: 'tekrar dene',
      }).expect(200);

      await mockAdapter.setMode(MockHbysMode.SUCCESS);
      await deliveries.processDelivery(deliveryId, 1);

      // The stored attempt number comes from the delivery's own counter. Taking
      // it from the queue's counter instead would restart at 1 and collide with
      // the attempt already recorded.
      expect(harness.hbysAttempts.map((row) => row.attemptNumber)).toEqual([1, 2]);
      expect(harness.hbysDeliveries[0]).toMatchObject({ attemptCount: 2 });
    });

    it('gives a manual retry a fresh automatic-retry budget', async () => {
      const deliveryId = await finalize();
      await mockAdapter.setMode(MockHbysMode.TIMEOUT);
      await runAttempts(deliveryId);
      expect(harness.hbysDeliveries[0]).toMatchObject({ status: 'FAILED' });

      await post(`/api/v1/hbys-deliveries/${deliveryId}/retry`, 'operation', {
        reason: 'yeniden dene',
      }).expect(200);

      // Still in TIMEOUT mode: the retry must be allowed to use the full
      // schedule again rather than failing immediately on the old budget.
      const first = await deliveries.processDelivery(deliveryId, 1);

      expect(first.retry).toBe(true);
      expect(harness.hbysAttempts.map((row) => row.attemptNumber)).toEqual([1, 2, 3, 4, 5]);
    });

    it('records the reason in the audit trail', async () => {
      const deliveryId = await failDelivery();

      await post(`/api/v1/hbys-deliveries/${deliveryId}/retry`, 'operation', {
        reason: 'Operasyon karari',
      }).expect(200);

      const audit = harness.auditLogs.find((row) => row.eventType === 'HBYS_MANUAL_RETRY');
      expect(audit).toMatchObject({
        actorUserId: 'u-operation',
        metadata: { reason: 'Operasyon karari' },
      });
    });

    it('lets a Manager retry as well', async () => {
      const deliveryId = await failDelivery();

      await post(`/api/v1/hbys-deliveries/${deliveryId}/retry`, 'manager', {
        reason: 'yonetici karari',
      }).expect(200);
    });

    it.each(['doctor', 'reporter'])('refuses a %s with 403', async (role) => {
      const deliveryId = await failDelivery();

      const response = await post(`/api/v1/hbys-deliveries/${deliveryId}/retry`, role, {
        reason: 'deneme',
      }).expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('requires a reason', async () => {
      const deliveryId = await failDelivery();

      const response = await post(
        `/api/v1/hbys-deliveries/${deliveryId}/retry`,
        'operation',
      ).expect(422);

      expect(response.body.error.details.fields).toHaveProperty('reason');
    });

    it('refuses to retry a delivery that already succeeded', async () => {
      const deliveryId = await finalize();
      await runAttempts(deliveryId);

      const response = await post(`/api/v1/hbys-deliveries/${deliveryId}/retry`, 'operation', {
        reason: 'tekrar gonder',
      }).expect(409);

      expect(response.body.error.code).toBe('HBYS_NOT_RETRYABLE');
    });
  });

  describe('attempts endpoint', () => {
    it('lists the attempts for Operation without exposing report content', async () => {
      const deliveryId = await finalize();
      await mockAdapter.setMode(MockHbysMode.TIMEOUT);
      await runAttempts(deliveryId);

      const response = await get(
        `/api/v1/hbys-deliveries/${deliveryId}/attempts`,
        'operation',
      ).expect(200);

      expect(response.body.data).toHaveLength(deliveries.maxAttempts);
      expect(response.body.data[0]).toMatchObject({ attemptNumber: 1, status: 'FAILED' });
      expect(JSON.stringify(response.body)).not.toContain('Rapor metni.');
    });

    it.each(['doctor', 'reporter'])('refuses a %s with 403', async (role) => {
      const deliveryId = await finalize();

      await get(`/api/v1/hbys-deliveries/${deliveryId}/attempts`, role).expect(403);
    });
  });

  describe('dev tools mock mode', () => {
    it('lets a Manager switch the mode', async () => {
      const response = await request(server())
        .put('/api/v1/dev-tools/mock-hbys')
        .set('Authorization', `Bearer ${tokens.manager}`)
        .send({ mode: 'FAIL' })
        .expect(200);

      expect(response.body.data).toEqual({ mode: 'FAIL' });
      await expect(mockAdapter.getMode()).resolves.toBe('FAIL');
    });

    it('rejects an unknown mode', async () => {
      await request(server())
        .put('/api/v1/dev-tools/mock-hbys')
        .set('Authorization', `Bearer ${tokens.manager}`)
        .send({ mode: 'MAYBE' })
        .expect(422);
    });

    it('refuses a non-Manager', async () => {
      await request(server())
        .put('/api/v1/dev-tools/mock-hbys')
        .set('Authorization', `Bearer ${tokens.operation}`)
        .send({ mode: 'FAIL' })
        .expect(403);
    });
  });
});
