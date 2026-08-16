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
