import request from 'supertest';
import { createTestHarness, type TestHarness } from './fixtures/auth-test-harness';
import { STUDY_IN_SCOPE_OLDEST, STUDY_OUT_OF_SCOPE } from './fixtures/study-fixtures';

/**
 * Start-reading and study locking over real HTTP
 * (TASK_QUEUE BACKEND-016, BACKEND-017, BACKEND-018).
 *
 * The mandatory concurrency guarantee is that a second doctor cannot open a
 * study another doctor is already reading (CLAUDE.md section 61).
 */
/** The suite pins this in jest-e2e.setup.ts; read it rather than repeat it. */
const LOCK_TTL_SECONDS = Number(process.env.LOCK_TTL_SECONDS ?? 60);

describe('Study locks (e2e)', () => {
  let harness: TestHarness;
  const tokens: Record<string, string> = {};
  const STUDY = STUDY_IN_SCOPE_OLDEST.id;

  beforeEach(async () => {
    // A fresh app per test: the lock lives in Redis, so state must not leak
    // between cases.
    harness = await createTestHarness({
      withRedis: true,
      studies: [
        { ...STUDY_IN_SCOPE_OLDEST, status: 'UNREAD' },
        { ...STUDY_OUT_OF_SCOPE, status: 'UNREAD' },
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

  const get = (path: string, role: string) =>
    request(harness.app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${tokens[role]}`);

  describe('start reading', () => {
    it('gives the doctor the study, the lock and the READING status', async () => {
      const response = await post(`/api/v1/studies/${STUDY}/start-reading`, 'doctorA').expect(200);

      expect(response.body.data).toMatchObject({
        studyId: STUDY,
        status: 'READING',
        lock: { ownerUserId: 'u-doctor', ownerRole: 'DOCTOR', heartbeatIntervalSeconds: 20 },
      });
      expect(response.body.data.readingStartedAt).toEqual(expect.any(String));
    });

    it('assigns the doctor and records history and audit', async () => {
      await post(`/api/v1/studies/${STUDY}/start-reading`, 'doctorA').expect(200);

      expect(harness.studies[0]).toMatchObject({
        status: 'READING',
        assignedDoctorId: 'u-doctor',
      });
      expect(harness.assignments).toContainEqual(
        expect.objectContaining({ studyId: STUDY, userId: 'u-doctor', type: 'DOCTOR' }),
      );
      expect(harness.statusHistory).toContainEqual(
        expect.objectContaining({ fromStatus: 'UNREAD', toStatus: 'READING' }),
      );
      expect(harness.auditLogs.map((row) => row.eventType)).toEqual(
        expect.arrayContaining(['STUDY_READING_STARTED', 'STUDY_STATUS_CHANGED']),
      );
    });

    it('refuses a second doctor with 423 STUDY_LOCKED', async () => {
      await post(`/api/v1/studies/${STUDY}/start-reading`, 'doctorA').expect(200);

      const response = await post(`/api/v1/studies/${STUDY}/start-reading`, 'doctorB').expect(423);

      expect(response.body.error.code).toBe('STUDY_LOCKED');
      expect(response.body.error.details).toMatchObject({
        ownerUserId: 'u-doctor',
        ownerRole: 'DOCTOR',
      });
      expect(response.body.error.details.ownerDisplayName).toEqual(expect.any(String));
    });

    it('leaves the study with the first doctor after a rejected second attempt', async () => {
      await post(`/api/v1/studies/${STUDY}/start-reading`, 'doctorA').expect(200);
      await post(`/api/v1/studies/${STUDY}/start-reading`, 'doctorB').expect(423);

      expect(harness.studies[0]).toMatchObject({
        status: 'READING',
        assignedDoctorId: 'u-doctor',
      });
    });

    it('lets exactly one of two simultaneous doctors win', async () => {
      const [a, b] = await Promise.all([
        post(`/api/v1/studies/${STUDY}/start-reading`, 'doctorA'),
        post(`/api/v1/studies/${STUDY}/start-reading`, 'doctorB'),
      ]);

      const statuses = [a.status, b.status].sort();
      expect(statuses).toEqual([200, 423]);
    });

    it.each(['reporter', 'operation', 'manager'])('refuses a %s with 403', async (role) => {
      const response = await post(`/api/v1/studies/${STUDY}/start-reading`, role).expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('refuses a study whose state is not UNREAD', async () => {
      await post(`/api/v1/studies/${STUDY}/start-reading`, 'doctorA').expect(200);
      // Now READING; the same doctor still cannot start again.
      const response = await post(`/api/v1/studies/${STUDY}/start-reading`, 'doctorA').expect(409);

      expect(response.body.error.code).toBe('INVALID_STATE_TRANSITION');
      expect(response.body.error.details).toMatchObject({ currentStatus: 'READING' });
    });

    it('refuses a study in an unauthorized hospital', async () => {
      const response = await post(
        `/api/v1/studies/${STUDY_OUT_OF_SCOPE.id}/start-reading`,
        'doctorA',
      ).expect(403);

      expect(response.body.error.code).toBe('HOSPITAL_ACCESS_DENIED');
    });

    it('returns 404 for a study that does not exist', async () => {
      await post(
        '/api/v1/studies/99999999-9999-4999-8999-999999999999/start-reading',
        'doctorA',
      ).expect(404);
    });
  });

  describe('heartbeat', () => {
    it('is accepted from the lock owner', async () => {
      await post(`/api/v1/studies/${STUDY}/start-reading`, 'doctorA').expect(200);

      const response = await post(`/api/v1/studies/${STUDY}/lock/heartbeat`, 'doctorA').expect(200);

      expect(response.body.data).toEqual({ valid: true, expiresInSeconds: LOCK_TTL_SECONDS });
    });

    it('is refused from anyone else with 423 LOCK_NOT_OWNED', async () => {
      await post(`/api/v1/studies/${STUDY}/start-reading`, 'doctorA').expect(200);

      const response = await post(`/api/v1/studies/${STUDY}/lock/heartbeat`, 'doctorB').expect(423);

      expect(response.body.error.code).toBe('LOCK_NOT_OWNED');
    });

    it('is refused when there is no lock at all', async () => {
      const response = await post(`/api/v1/studies/${STUDY}/lock/heartbeat`, 'doctorA').expect(423);

      expect(response.body.error.code).toBe('LOCK_NOT_OWNED');
    });
  });

  describe('release', () => {
    it('frees the study for another doctor', async () => {
      await post(`/api/v1/studies/${STUDY}/start-reading`, 'doctorA').expect(200);

      const release = await post(`/api/v1/studies/${STUDY}/lock/release`, 'doctorA').expect(200);
      expect(release.body.data).toEqual({ released: true });

      // The study is READING now, so doctor B cannot start reading, but the
      // lock itself is gone.
      const lock = await get(`/api/v1/studies/${STUDY}/lock`, 'doctorB').expect(200);
      expect(lock.body.data.locked).toBe(false);
    });

    it('does not change the study status', async () => {
      await post(`/api/v1/studies/${STUDY}/start-reading`, 'doctorA').expect(200);
      await post(`/api/v1/studies/${STUDY}/lock/release`, 'doctorA').expect(200);

      expect(harness.studies[0]).toMatchObject({ status: 'READING' });
    });

    it('is refused from a non-owner', async () => {
      await post(`/api/v1/studies/${STUDY}/start-reading`, 'doctorA').expect(200);

      const response = await post(`/api/v1/studies/${STUDY}/lock/release`, 'doctorB').expect(423);

      expect(response.body.error.code).toBe('LOCK_NOT_OWNED');
    });

    it('is harmless when there is nothing to release', async () => {
      const response = await post(`/api/v1/studies/${STUDY}/lock/release`, 'doctorA').expect(200);

      expect(response.body.data).toEqual({ released: false });
    });
  });

  describe('force release', () => {
    it('lets Operation take a lock away, with the reason audited', async () => {
      await post(`/api/v1/studies/${STUDY}/start-reading`, 'doctorA').expect(200);

      const response = await post(`/api/v1/studies/${STUDY}/lock/force-release`, 'operation', {
        reason: 'User session disconnected.',
      }).expect(200);

      expect(response.body.data).toEqual({ released: true, previousOwnerUserId: 'u-doctor' });

      const audit = harness.auditLogs.find(
        (row) => row.eventType === 'STUDY_LOCK_FORCE_RELEASED',
      );
      expect(audit).toMatchObject({
        actorUserId: 'u-operation',
        metadata: {
          reason: 'User session disconnected.',
          previousOwnerUserId: 'u-doctor',
          previousOwnerRole: 'DOCTOR',
        },
      });
    });

    it('lets Manager do it too', async () => {
      await post(`/api/v1/studies/${STUDY}/start-reading`, 'doctorA').expect(200);

      await post(`/api/v1/studies/${STUDY}/lock/force-release`, 'manager', {
        reason: 'Recovery',
      }).expect(200);
    });

    it.each(['doctorA', 'doctorB', 'reporter'])('refuses a %s with 403', async (role) => {
      await post(`/api/v1/studies/${STUDY}/start-reading`, 'doctorA').expect(200);

      const response = await post(`/api/v1/studies/${STUDY}/lock/force-release`, role, {
        reason: 'Let me in',
      }).expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('requires a reason', async () => {
      await post(`/api/v1/studies/${STUDY}/start-reading`, 'doctorA').expect(200);

      const response = await post(
        `/api/v1/studies/${STUDY}/lock/force-release`,
        'operation',
        {},
      ).expect(422);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details.fields).toHaveProperty('reason');
    });

    it('rejects a blank reason', async () => {
      await post(`/api/v1/studies/${STUDY}/start-reading`, 'doctorA').expect(200);

      await post(`/api/v1/studies/${STUDY}/lock/force-release`, 'operation', {
        reason: '   ',
      }).expect(422);
    });

    it('frees the study so another doctor can be given it after recovery', async () => {
      await post(`/api/v1/studies/${STUDY}/start-reading`, 'doctorA').expect(200);
      await post(`/api/v1/studies/${STUDY}/lock/force-release`, 'operation', {
        reason: 'Session lost',
      }).expect(200);

      const lock = await get(`/api/v1/studies/${STUDY}/lock`, 'doctorB').expect(200);
      expect(lock.body.data.locked).toBe(false);
    });
  });

  describe('lock state', () => {
    it('reports an unlocked study', async () => {
      const response = await get(`/api/v1/studies/${STUDY}/lock`, 'doctorA').expect(200);

      expect(response.body.data).toMatchObject({ locked: false, ownerUserId: null });
    });

    it('reports the owner so the frontend can explain the 423', async () => {
      await post(`/api/v1/studies/${STUDY}/start-reading`, 'doctorA').expect(200);

      const response = await get(`/api/v1/studies/${STUDY}/lock`, 'doctorB').expect(200);

      expect(response.body.data).toMatchObject({
        locked: true,
        ownerUserId: 'u-doctor',
        ownerRole: 'DOCTOR',
      });
      // Still inside its lifetime, and never longer than the configured TTL.
      expect(response.body.data.expiresInSeconds).toBeGreaterThan(0);
      expect(response.body.data.expiresInSeconds).toBeLessThanOrEqual(LOCK_TTL_SECONDS);
    });

    it('is refused for a study in an unauthorized hospital', async () => {
      const response = await get(
        `/api/v1/studies/${STUDY_OUT_OF_SCOPE.id}/lock`,
        'doctorA',
      ).expect(403);

      expect(response.body.error.code).toBe('HOSPITAL_ACCESS_DENIED');
    });
  });
});
