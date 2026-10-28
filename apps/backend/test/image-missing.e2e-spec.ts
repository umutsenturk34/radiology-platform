import request from 'supertest';
import { createTestHarness, type TestHarness } from './fixtures/auth-test-harness';
import { STUDY_IN_SCOPE_OLDEST, STUDY_OUT_OF_SCOPE } from './fixtures/study-fixtures';

/**
 * IMAGE_MISSING over real HTTP (TASK_QUEUE BACKEND-042).
 *
 * Acceptance: the reason is kept as an incident, the report and the resolution
 * are audited, and the reading lock is released when the doctor reports.
 */
describe('Image missing (e2e)', () => {
  let harness: TestHarness;
  const tokens: Record<string, string> = {};
  const STUDY = STUDY_IN_SCOPE_OLDEST.id;
  const REASON = 'Mediasten serisi eksik.';

  beforeEach(async () => {
    harness = await createTestHarness({
      withRedis: true,
      studies: [
        { ...STUDY_IN_SCOPE_OLDEST, status: 'UNREAD' },
        { ...STUDY_OUT_OF_SCOPE, status: 'READING' },
      ],
      hospitalAccess: [
        { userId: 'u-doctor', hospitalId: STUDY_IN_SCOPE_OLDEST.hospitalId },
        { userId: 'u-doctor-b', hospitalId: STUDY_IN_SCOPE_OLDEST.hospitalId },
        { userId: 'u-reporter', hospitalId: STUDY_IN_SCOPE_OLDEST.hospitalId },
        { userId: 'u-operation', hospitalId: STUDY_IN_SCOPE_OLDEST.hospitalId },
      ],
    });

    for (const [key, email] of [
      ['doctorA', 'doctor@test.local'],
      ['doctorB', 'doctor.b@test.local'],
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

  const post = (path: string, role: string, body?: object) =>
    request(harness.app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${tokens[role]}`)
      .send(body ?? {});

  const startReading = () => post(`/api/v1/studies/${STUDY}/start-reading`, 'doctorA').expect(200);
  const markMissing = (role = 'doctorA', reason: string | null = REASON) =>
    post(`/api/v1/studies/${STUDY}/image-missing`, role, reason === null ? {} : { reason });
  const resolve = (role = 'operation', body: object = {}) =>
    post(`/api/v1/studies/${STUDY}/image-missing/resolve`, role, body);

  describe('mark image missing', () => {
    it('parks the study, opens an incident and releases the lock', async () => {
      await startReading();

      const response = await markMissing().expect(200);

      expect(response.body.data).toEqual({
        studyId: STUDY,
        status: 'IMAGE_MISSING',
        incidentId: expect.any(String),
        lockReleased: true,
      });
      expect(harness.studies[0]).toMatchObject({ status: 'IMAGE_MISSING', assignedDoctorId: null });
      expect(harness.imageIncidents).toEqual([
        expect.objectContaining({
          id: response.body.data.incidentId,
          studyId: STUDY,
          reportedBy: 'u-doctor',
          reason: REASON,
          status: 'OPEN',
        }),
      ]);

      // The lock is really gone: another doctor can take the study straight
      // away once it is back in the pool.
      const lock = await request(harness.app.getHttpServer())
        .get(`/api/v1/studies/${STUDY}/lock`)
        .set('Authorization', `Bearer ${tokens.doctorB}`)
        .expect(200);
      expect(lock.body.data.locked).toBe(false);
    });

    it('records history and an audit entry that does not carry the reason', async () => {
      await startReading();
      const response = await markMissing().expect(200);

      expect(harness.statusHistory).toContainEqual(
        expect.objectContaining({
          fromStatus: 'READING',
          toStatus: 'IMAGE_MISSING',
          reason: REASON,
        }),
      );
      const audit = harness.auditLogs.find((row) => row.eventType === 'IMAGE_MISSING_REPORTED');
      expect(audit).toMatchObject({
        studyId: STUDY,
        entityId: response.body.data.incidentId,
        metadata: { incidentId: response.body.data.incidentId },
      });
      expect(JSON.stringify(audit?.metadata)).not.toContain(REASON);
    });

    it('requires a reason', async () => {
      await startReading();

      const response = await markMissing('doctorA', null).expect(422);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');

      await markMissing('doctorA', '   ').expect(422);
      expect(harness.studies[0].status).toBe('READING');
      expect(harness.imageIncidents).toHaveLength(0);
    });

    it('refuses a doctor who does not hold the lock', async () => {
      await startReading();

      const response = await markMissing('doctorB').expect(423);

      expect(response.body.error.code).toBe('LOCK_NOT_OWNED');
      expect(harness.studies[0].status).toBe('READING');
      expect(harness.imageIncidents).toHaveLength(0);
    });

    it('refuses a study that is not being read', async () => {
      const response = await markMissing().expect(409);

      expect(response.body.error.code).toBe('INVALID_STATE_TRANSITION');
      expect(harness.imageIncidents).toHaveLength(0);
    });

    it.each(['reporter', 'operation', 'manager'])('refuses a %s with 403', async (role) => {
      await startReading();

      await markMissing(role).expect(403);
      expect(harness.studies[0].status).toBe('READING');
    });

    it('refuses a study in a hospital the doctor has no access to', async () => {
      const response = await post(
        `/api/v1/studies/${STUDY_OUT_OF_SCOPE.id}/image-missing`,
        'doctorA',
        { reason: REASON },
      ).expect(403);

      expect(response.body.error.code).toBe('HOSPITAL_ACCESS_DENIED');
    });

    it('refuses a second report while the study is already parked', async () => {
      await startReading();
      await markMissing().expect(200);

      await markMissing().expect(409);
      expect(harness.imageIncidents).toHaveLength(1);
    });
  });

  describe('resolve image missing', () => {
    beforeEach(async () => {
      await startReading();
      await markMissing().expect(200);
    });

    it.each(['operation', 'manager'])('lets %s send the study back to UNREAD', async (role) => {
      const response = await resolve(role, { resolutionNote: 'Seri PACS e gonderildi.' }).expect(
        200,
      );

      expect(response.body.data).toEqual({ studyId: STUDY, status: 'UNREAD' });
      expect(harness.studies[0].status).toBe('UNREAD');
      expect(harness.imageIncidents[0]).toMatchObject({
        status: 'RESOLVED',
        resolvedBy: role === 'operation' ? 'u-operation' : expect.any(String),
        resolutionNote: 'Seri PACS e gonderildi.',
        reason: REASON,
      });
      expect(harness.imageIncidents[0].resolvedAt).toEqual(expect.any(Date));
      expect(harness.auditLogs.map((row) => row.eventType)).toContain('IMAGE_MISSING_RESOLVED');
      expect(harness.statusHistory).toContainEqual(
        expect.objectContaining({ fromStatus: 'IMAGE_MISSING', toStatus: 'UNREAD' }),
      );
    });

    it('accepts a resolve without a note', async () => {
      await resolve('operation').expect(200);
      expect(harness.imageIncidents[0]).toMatchObject({ status: 'RESOLVED', resolutionNote: null });
    });

    it.each(['doctorA', 'reporter'])('refuses a %s with 403', async (role) => {
      await resolve(role).expect(403);
      expect(harness.studies[0].status).toBe('IMAGE_MISSING');
      expect(harness.imageIncidents[0].status).toBe('OPEN');
    });

    it('refuses a study that is not IMAGE_MISSING', async () => {
      await resolve('operation').expect(200);

      const response = await resolve('operation').expect(409);
      expect(response.body.error.code).toBe('INVALID_STATE_TRANSITION');
    });

    it('lets the study be read again and reported a second time, keeping both incidents', async () => {
      await resolve('operation').expect(200);
      await startReading();
      await markMissing('doctorA', 'Ikinci seri de eksik.').expect(200);

      expect(harness.imageIncidents).toHaveLength(2);
      expect(harness.imageIncidents.map((row) => row.status)).toEqual(['RESOLVED', 'OPEN']);
      expect(harness.imageIncidents[0].reason).toBe(REASON);
    });
  });
});
