import request from 'supertest';
import { createTestHarness, type TestHarness } from './fixtures/auth-test-harness';
import { STUDY_IN_SCOPE_OLDEST, STUDY_OUT_OF_SCOPE } from './fixtures/study-fixtures';

/**
 * Reporter workflow over real HTTP
 * (TASK_QUEUE BACKEND-025 through BACKEND-029).
 *
 * The mandatory concurrency guarantee mirrors the doctor one: a second reporter
 * cannot open a study another reporter already holds (CLAUDE.md section 61).
 */
describe('Reports (e2e)', () => {
  let harness: TestHarness;
  const tokens: Record<string, string> = {};
  const STUDY = STUDY_IN_SCOPE_OLDEST.id;

  beforeEach(async () => {
    harness = await createTestHarness({
      withRedis: true,
      studies: [
        { ...STUDY_IN_SCOPE_OLDEST, status: 'WAITING_TRANSCRIPTION' },
        { ...STUDY_OUT_OF_SCOPE, status: 'WAITING_TRANSCRIPTION' },
      ],
      hospitalAccess: [
        { userId: 'u-doctor', hospitalId: STUDY_IN_SCOPE_OLDEST.hospitalId },
        { userId: 'u-reporter', hospitalId: STUDY_IN_SCOPE_OLDEST.hospitalId },
        { userId: 'u-reporter-b', hospitalId: STUDY_IN_SCOPE_OLDEST.hospitalId },
        { userId: 'u-operation', hospitalId: STUDY_IN_SCOPE_OLDEST.hospitalId },
      ],
    });

    for (const [key, email] of [
      ['reporterA', 'reporter@test.local'],
      ['reporterB', 'reporter.b@test.local'],
      ['doctor', 'doctor@test.local'],
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
  const put = (path: string, role: string, body?: object) =>
    request(server())
      .put(path)
      .set('Authorization', `Bearer ${tokens[role]}`)
      .send(body ?? {});
  const get = (path: string, role: string) =>
    request(server()).get(path).set('Authorization', `Bearer ${tokens[role]}`);

  const startTranscription = (role = 'reporterA') =>
    post(`/api/v1/studies/${STUDY}/start-transcription`, role);

  describe('start transcription', () => {
    it('gives the reporter the study, a draft and the lock', async () => {
      const response = await startTranscription().expect(200);

      expect(response.body.data).toMatchObject({
        studyId: STUDY,
        status: 'TRANSCRIBING',
        lock: { ownerUserId: 'u-reporter', ownerRole: 'REPORTER' },
        report: {
          status: 'DRAFT',
          currentVersion: { versionNumber: 1, content: '', status: 'DRAFT' },
        },
      });
    });

    it('assigns the reporter and records the transition', async () => {
      await startTranscription().expect(200);

      expect(harness.studies[0]).toMatchObject({
        status: 'TRANSCRIBING',
        assignedReporterId: 'u-reporter',
      });
      expect(harness.statusHistory).toContainEqual(
        expect.objectContaining({
          fromStatus: 'WAITING_TRANSCRIPTION',
          toStatus: 'TRANSCRIBING',
        }),
      );
      expect(harness.auditLogs.map((row) => row.eventType)).toContain('TRANSCRIPTION_STARTED');
    });

    it('refuses a second reporter with 423 STUDY_LOCKED', async () => {
      await startTranscription('reporterA').expect(200);

      const response = await startTranscription('reporterB').expect(423);

      expect(response.body.error.code).toBe('STUDY_LOCKED');
      expect(response.body.error.details).toMatchObject({
        ownerUserId: 'u-reporter',
        ownerRole: 'REPORTER',
      });
    });

    it('lets exactly one of two simultaneous reporters win', async () => {
      const [a, b] = await Promise.all([
        startTranscription('reporterA'),
        startTranscription('reporterB'),
      ]);

      expect([a.status, b.status].sort()).toEqual([200, 423]);
    });

    it('leaves the study with the first reporter after a rejected attempt', async () => {
      await startTranscription('reporterA').expect(200);
      await startTranscription('reporterB').expect(423);

      expect(harness.studies[0]).toMatchObject({
        status: 'TRANSCRIBING',
        assignedReporterId: 'u-reporter',
      });
    });

    it.each(['doctor', 'operation', 'manager'])('refuses a %s with 403', async (role) => {
      const response = await startTranscription(role).expect(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('refuses a study that is not waiting for transcription', async () => {
      await startTranscription('reporterA').expect(200);

      // Now TRANSCRIBING; the same reporter cannot start again.
      const response = await startTranscription('reporterA').expect(409);
      expect(response.body.error.code).toBe('INVALID_STATE_TRANSITION');
    });

    it('refuses a study in an unauthorized hospital', async () => {
      const response = await post(
        `/api/v1/studies/${STUDY_OUT_OF_SCOPE.id}/start-transcription`,
        'reporterA',
      ).expect(403);

      expect(response.body.error.code).toBe('HOSPITAL_ACCESS_DENIED');
    });
  });

  describe('draft', () => {
    it('saves content for the lock owner', async () => {
      await startTranscription().expect(200);

      const response = await put(`/api/v1/studies/${STUDY}/report/draft`, 'reporterA', {
        content: 'Toraks BT bulgulari...',
      }).expect(200);

      expect(response.body.data).toMatchObject({ status: 'DRAFT' });
      expect(response.body.data.savedAt).toEqual(expect.any(String));
      expect(harness.reportVersions[0]).toMatchObject({ content: 'Toraks BT bulgulari...' });
    });

    it('accepts an empty autosave without failing the client', async () => {
      await startTranscription().expect(200);

      await put(`/api/v1/studies/${STUDY}/report/draft`, 'reporterA', { content: '' }).expect(200);
    });

    it('refuses a reporter who does not hold the lock', async () => {
      await startTranscription('reporterA').expect(200);

      const response = await put(`/api/v1/studies/${STUDY}/report/draft`, 'reporterB', {
        content: 'baska raportor',
      }).expect(423);

      expect(response.body.error.code).toBe('LOCK_NOT_OWNED');
    });

    it.each(['doctor', 'manager'])('refuses a %s with 403', async (role) => {
      await startTranscription().expect(200);

      await put(`/api/v1/studies/${STUDY}/report/draft`, role, { content: 'x' }).expect(403);
    });

    it('refuses a draft save on a study that is not being transcribed', async () => {
      const response = await put(`/api/v1/studies/${STUDY}/report/draft`, 'reporterA', {
        content: 'x',
      }).expect(409);

      expect(response.body.error.code).toBe('INVALID_STATE_TRANSITION');
    });

    it('rejects a non-string content', async () => {
      await startTranscription().expect(200);

      const response = await put(`/api/v1/studies/${STUDY}/report/draft`, 'reporterA', {
        content: 42,
      }).expect(422);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('get report', () => {
    it('is readable by the doctor as well', async () => {
      await startTranscription().expect(200);
      await put(`/api/v1/studies/${STUDY}/report/draft`, 'reporterA', {
        content: 'Bulgular',
      }).expect(200);

      const response = await get(`/api/v1/studies/${STUDY}/report`, 'doctor').expect(200);

      expect(response.body.data).toMatchObject({
        status: 'DRAFT',
        currentVersion: {
          content: 'Bulgular',
          versionNumber: 1,
          createdBy: { id: 'u-reporter' },
        },
      });
    });

    it('returns 404 before any report exists', async () => {
      const response = await get(`/api/v1/studies/${STUDY}/report`, 'doctor').expect(404);

      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('refuses a study in an unauthorized hospital', async () => {
      await get(`/api/v1/studies/${STUDY_OUT_OF_SCOPE.id}/report`, 'reporterA').expect(403);
    });
  });

  /**
   * `GET /studies/:id/report/versions` (API_CONTRACT section 81,
   * TASK_QUEUE DISCOVERED-007).
   *
   * The frontend renders real history from this or renders none at all, so the
   * ordering and the authorization are what these cases pin down.
   */
  describe('report versions', () => {
    it('returns the draft as version 1 once transcription has started', async () => {
      await startTranscription().expect(200);
      await put(`/api/v1/studies/${STUDY}/report/draft`, 'reporterA', {
        content: 'Ilk taslak',
      }).expect(200);

      const response = await get(`/api/v1/studies/${STUDY}/report/versions`, 'reporterA').expect(
        200,
      );

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toMatchObject({
        versionNumber: 1,
        status: 'DRAFT',
        source: 'REPORTER',
        content: 'Ilk taslak',
        createdBy: { id: 'u-reporter' },
      });
      expect(response.body.data[0]).toHaveProperty('createdAt');
    });

    it('keeps the superseded version and orders history by versionNumber', async () => {
      // Submit, send back, and start again: that is what actually produces a
      // second version, so the history is real rather than hand-built.
      await startTranscription().expect(200);
      await put(`/api/v1/studies/${STUDY}/report/draft`, 'reporterA', { content: 'v1 metni' }).expect(200); // prettier-ignore
      await post(`/api/v1/studies/${STUDY}/submit-report`, 'reporterA').expect(200);
      await post(`/api/v1/studies/${STUDY}/start-approval`, 'doctor').expect(200);
      await post(`/api/v1/studies/${STUDY}/return-to-reporter`, 'doctor', {
        reason: 'Bulgular eksik',
      }).expect(200);
      await startTranscription().expect(200);

      const response = await get(`/api/v1/studies/${STUDY}/report/versions`, 'reporterA').expect(
        200,
      );

      const numbers = response.body.data.map((v: { versionNumber: number }) => v.versionNumber);
      expect(numbers).toEqual([...numbers].sort((a: number, b: number) => a - b));
      expect(numbers.length).toBeGreaterThanOrEqual(2);
      // The first version still carries its own text; a new draft never
      // rewrites it (CLAUDE.md section 21).
      expect(response.body.data[0]).toMatchObject({ versionNumber: 1, content: 'v1 metni' });
    });

    it('is stable across repeated calls', async () => {
      await startTranscription().expect(200);

      const first = await get(`/api/v1/studies/${STUDY}/report/versions`, 'reporterA').expect(200);
      const second = await get(`/api/v1/studies/${STUDY}/report/versions`, 'reporterA').expect(200);

      expect(second.body.data).toEqual(first.body.data);
    });

    it.each(['reporterA', 'doctor', 'operation', 'manager'])(
      'is readable by %s (AUTH_ROLES_PERMISSIONS section 91)',
      async (role) => {
        await startTranscription().expect(200);

        const response = await get(`/api/v1/studies/${STUDY}/report/versions`, role).expect(200);
        expect(Array.isArray(response.body.data)).toBe(true);
      },
    );

    it('returns 404 NOT_FOUND before any report exists', async () => {
      const response = await get(`/api/v1/studies/${STUDY}/report/versions`, 'doctor').expect(404);

      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 NOT_FOUND for a study that does not exist', async () => {
      const response = await get(
        '/api/v1/studies/99999999-9999-4999-8999-999999999999/report/versions',
        'doctor',
      ).expect(404);

      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('refuses a study in an unauthorized hospital', async () => {
      const response = await get(
        `/api/v1/studies/${STUDY_OUT_OF_SCOPE.id}/report/versions`,
        'reporterA',
      ).expect(403);

      expect(response.body.error.code).toBe('HOSPITAL_ACCESS_DENIED');
      expect(response.body).not.toHaveProperty('data');
    });

    it('requires authentication', async () => {
      const response = await request(server())
        .get(`/api/v1/studies/${STUDY}/report/versions`)
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects a malformed studyId with 422', async () => {
      await get('/api/v1/studies/not-a-uuid/report/versions', 'doctor').expect(422);
    });
  });

  /**
   * The reporter lock is ephemeral by design: TTL 60s, heartbeat 20s
   * (WORKFLOW_STATE_MACHINE section 32). These cases pin down what the backend
   * does when it lapses, which is what FRONTEND-013 ran into
   * (TASK_QUEUE DISCOVERED-008).
   */
  describe('reporter lock lifetime', () => {
    it('holds the lock for the reporter after start-transcription', async () => {
      await startTranscription().expect(200);

      const response = await get(`/api/v1/studies/${STUDY}/lock`, 'reporterA').expect(200);

      expect(response.body.data).toMatchObject({
        locked: true,
        type: 'INTERNAL',
        ownerUserId: 'u-reporter',
        ownerRole: 'REPORTER',
      });
      expect(response.body.data.expiresInSeconds).toBeGreaterThan(0);
    });

    it('refuses a draft save once the lock is gone, instead of writing anyway', async () => {
      await startTranscription().expect(200);
      // Exactly what a browser that stopped sending heartbeats leaves behind.
      await post(`/api/v1/studies/${STUDY}/lock/release`, 'reporterA').expect(200);

      const response = await put(`/api/v1/studies/${STUDY}/report/draft`, 'reporterA', {
        content: 'kilitsiz yazma denemesi',
      }).expect(423);

      expect(response.body.error.code).toBe('LOCK_NOT_OWNED');
    });

    it('leaves the study TRANSCRIBING with its assignment when the lock lapses', async () => {
      await startTranscription().expect(200);
      await post(`/api/v1/studies/${STUDY}/lock/release`, 'reporterA').expect(200);

      // WORKFLOW_STATE_MACHINE section 74 invariant 2: a TRANSCRIBING study
      // still has an active reporter assignment. Losing the lock is not losing
      // the work.
      const detail = await get(`/api/v1/studies/${STUDY}`, 'reporterA').expect(200);
      expect(detail.body.data.status).toBe('TRANSCRIBING');
      expect(detail.body.data.assignment.reporter).toMatchObject({ id: 'u-reporter' });
      expect(detail.body.data.lock.locked).toBe(false);
    });

    it('cannot be recovered with start-transcription, which is the DISCOVERED-008 gap', async () => {
      await startTranscription().expect(200);
      await post(`/api/v1/studies/${STUDY}/lock/release`, 'reporterA').expect(200);

      // Documented here so the dead end is a known, tested fact rather than
      // something the frontend rediscovers: the study has left
      // WAITING_TRANSCRIPTION, so the entry point refuses it.
      const response = await startTranscription().expect(409);
      expect(response.body.error.code).toBe('INVALID_STATE_TRANSITION');

      // And a heartbeat cannot revive a lock that no longer exists.
      const beat = await post(`/api/v1/studies/${STUDY}/lock/heartbeat`, 'reporterA').expect(423);
      expect(beat.body.error.code).toBe('LOCK_NOT_OWNED');
    });

    it('still refuses a second reporter while the first holds the lock', async () => {
      await startTranscription('reporterA').expect(200);

      const response = await startTranscription('reporterB').expect(423);
      expect(response.body.error.code).toBe('STUDY_LOCKED');
    });
  });

  describe('submit report', () => {
    async function transcribeAndSubmit(content = 'Tamamlanan rapor metni.') {
      await startTranscription().expect(200);
      await put(`/api/v1/studies/${STUDY}/report/draft`, 'reporterA', { content }).expect(200);
      return post(`/api/v1/studies/${STUDY}/submit-report`, 'reporterA');
    }

    it('hands the study to the approval queue and releases the lock', async () => {
      const response = await transcribeAndSubmit();

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        studyId: STUDY,
        status: 'WAITING_APPROVAL',
        report: { status: 'WAITING_APPROVAL' },
        lockReleased: true,
      });
      expect(harness.studies[0]).toMatchObject({ status: 'WAITING_APPROVAL' });
    });

    it('completes the version rather than leaving it a draft', async () => {
      await transcribeAndSubmit();

      expect(harness.reportVersions[0]).toMatchObject({
        status: 'COMPLETED',
        content: 'Tamamlanan rapor metni.',
      });
      expect(harness.reportVersions[0].completedAt).toBeInstanceOf(Date);
    });

    it('frees the lock so the doctor can take the study for approval', async () => {
      await transcribeAndSubmit();

      const lock = await get(`/api/v1/studies/${STUDY}/lock`, 'doctor').expect(200);
      expect(lock.body.data.locked).toBe(false);
    });

    it('accepts the content in the submit call itself', async () => {
      await startTranscription().expect(200);

      const response = await post(`/api/v1/studies/${STUDY}/submit-report`, 'reporterA', {
        content: 'Dogrudan gonderilen icerik.',
      }).expect(200);

      expect(response.body.data.status).toBe('WAITING_APPROVAL');
      expect(harness.reportVersions[0]).toMatchObject({ content: 'Dogrudan gonderilen icerik.' });
    });

    it('refuses an empty report', async () => {
      await startTranscription().expect(200);

      const response = await post(`/api/v1/studies/${STUDY}/submit-report`, 'reporterA').expect(
        422,
      );

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(harness.studies[0]).toMatchObject({ status: 'TRANSCRIBING' });
    });

    it('refuses a whitespace-only report', async () => {
      await startTranscription().expect(200);

      await post(`/api/v1/studies/${STUDY}/submit-report`, 'reporterA', {
        content: '   \n  ',
      }).expect(422);
    });

    it('refuses a reporter who does not hold the lock', async () => {
      await startTranscription('reporterA').expect(200);

      const response = await post(`/api/v1/studies/${STUDY}/submit-report`, 'reporterB', {
        content: 'baska raportor',
      }).expect(423);

      expect(response.body.error.code).toBe('LOCK_NOT_OWNED');
    });

    it('refuses a second submit', async () => {
      await transcribeAndSubmit();

      const response = await post(`/api/v1/studies/${STUDY}/submit-report`, 'reporterA', {
        content: 'tekrar',
      }).expect(409);

      expect(response.body.error.code).toBe('INVALID_STATE_TRANSITION');
    });

    it('does not let the reporter edit the completed version afterwards', async () => {
      await transcribeAndSubmit();

      // The study is no longer TRANSCRIBING, so the draft route is closed and
      // the completed text stays as submitted.
      await put(`/api/v1/studies/${STUDY}/report/draft`, 'reporterA', {
        content: 'sonradan degistirildi',
      }).expect(409);

      expect(harness.reportVersions[0]).toMatchObject({ content: 'Tamamlanan rapor metni.' });
    });

    it.each(['doctor', 'manager'])('refuses a %s with 403', async (role) => {
      await startTranscription().expect(200);

      await post(`/api/v1/studies/${STUDY}/submit-report`, role, { content: 'x' }).expect(403);
    });
  });
});
