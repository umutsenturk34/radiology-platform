import request from 'supertest';
import { createTestHarness, type TestHarness } from './fixtures/auth-test-harness';
import { STUDY_IN_SCOPE_OLDEST, STUDY_OUT_OF_SCOPE } from './fixtures/study-fixtures';

/**
 * Dictation lifecycle and complete-reading over real HTTP
 * (TASK_QUEUE BACKEND-021, BACKEND-022, BACKEND-023, BACKEND-024).
 *
 * The audio never reaches PostgreSQL: the suite asserts that the bytes land in
 * object storage and that only metadata is persisted (CLAUDE.md section 20).
 */
describe('Dictations (e2e)', () => {
  let harness: TestHarness;
  const tokens: Record<string, string> = {};
  const STUDY = STUDY_IN_SCOPE_OLDEST.id;
  const AUDIO = Buffer.from('fake-opus-audio-bytes');

  beforeEach(async () => {
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

  /** Puts the study into READING with doctor A holding the lock. */
  async function startReading() {
    await post(`/api/v1/studies/${STUDY}/start-reading`, 'doctorA').expect(200);
  }

  async function createDictation(role = 'doctorA') {
    const response = await post(`/api/v1/studies/${STUDY}/dictations`, role, {
      mimeType: 'audio/webm;codecs=opus',
    }).expect(201);
    return response.body.data.id as string;
  }

  function upload(dictationId: string, role: string, body = AUDIO) {
    return request(server())
      .post(`/api/v1/dictations/${dictationId}/upload`)
      .set('Authorization', `Bearer ${tokens[role]}`)
      .field('durationMs', '127000')
      .attach('file', body, { filename: 'dictation.webm', contentType: 'audio/webm' });
  }

  describe('create', () => {
    it('starts a recording for the lock owner', async () => {
      await startReading();

      const response = await post(`/api/v1/studies/${STUDY}/dictations`, 'doctorA', {
        mimeType: 'audio/webm;codecs=opus',
      }).expect(201);

      expect(response.body.data).toMatchObject({
        studyId: STUDY,
        status: 'RECORDING',
        doctor: { id: 'u-doctor' },
      });
      expect(response.body.data.startedAt).toEqual(expect.any(String));
    });

    it('refuses a doctor who does not hold the lock', async () => {
      await startReading();

      const response = await post(`/api/v1/studies/${STUDY}/dictations`, 'doctorB', {}).expect(423);

      expect(response.body.error.code).toBe('LOCK_NOT_OWNED');
    });

    it('refuses a study that is not being read', async () => {
      const response = await post(`/api/v1/studies/${STUDY}/dictations`, 'doctorA', {}).expect(409);

      expect(response.body.error.code).toBe('INVALID_STATE_TRANSITION');
    });

    it.each(['reporter', 'manager'])('refuses a %s with 403', async (role) => {
      await startReading();

      const response = await post(`/api/v1/studies/${STUDY}/dictations`, role, {}).expect(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects an unsupported audio type', async () => {
      await startReading();

      const response = await post(`/api/v1/studies/${STUDY}/dictations`, 'doctorA', {
        mimeType: 'video/mp4',
      }).expect(422);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('upload', () => {
    it('stores the audio in object storage and completes the record', async () => {
      await startReading();
      const dictationId = await createDictation();

      const response = await upload(dictationId, 'doctorA').expect(200);

      expect(response.body.data).toMatchObject({
        id: dictationId,
        status: 'COMPLETED',
        fileSize: AUDIO.byteLength,
        durationMs: 127000,
      });
      expect(response.body.data.uploadedAt).toEqual(expect.any(String));
    });

    it('keeps the bytes out of the database', async () => {
      await startReading();
      const dictationId = await createDictation();
      await upload(dictationId, 'doctorA').expect(200);

      // One object stored, and the database row references it by key only.
      expect(harness.storedObjects.size).toBe(1);
      const [storedKey] = [...harness.storedObjects.keys()];
      const row = harness.dictations.find((entry) => entry.id === dictationId);
      expect(row?.storageKey).toBe(storedKey);
      expect(JSON.stringify(row)).not.toContain(AUDIO.toString());
    });

    it('refuses an upload from a doctor who is not the recorder', async () => {
      await startReading();
      const dictationId = await createDictation();

      const response = await upload(dictationId, 'doctorB').expect(403);

      // Recording ownership is checked before the lock: "this is not your
      // recording" is the more specific answer, and doctor B fails both.
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('refuses replacing a completed recording', async () => {
      await startReading();
      const dictationId = await createDictation();
      await upload(dictationId, 'doctorA').expect(200);

      const response = await upload(dictationId, 'doctorA').expect(409);

      expect(response.body.error.code).toBe('CONFLICT');
    });

    it('requires a file', async () => {
      await startReading();
      const dictationId = await createDictation();

      const response = await request(server())
        .post(`/api/v1/dictations/${dictationId}/upload`)
        .set('Authorization', `Bearer ${tokens.doctorA}`)
        .field('durationMs', '1000')
        .expect(422);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 for an unknown dictation', async () => {
      await startReading();

      await upload('99999999-9999-4999-8999-999999999999', 'doctorA').expect(404);
    });
  });

  describe('list and playback', () => {
    it('lists the study dictations for the reporter as well', async () => {
      await startReading();
      const dictationId = await createDictation();
      await upload(dictationId, 'doctorA').expect(200);

      const response = await get(`/api/v1/studies/${STUDY}/dictations`, 'reporter').expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toMatchObject({ id: dictationId, status: 'COMPLETED' });
    });

    it('returns a short-lived playback URL, not a public one', async () => {
      await startReading();
      const dictationId = await createDictation();
      await upload(dictationId, 'doctorA').expect(200);

      const response = await get(`/api/v1/dictations/${dictationId}/playback`, 'reporter').expect(
        200,
      );

      expect(response.body.data.url).toContain(`/dictations/${dictationId}/audio?token=`);
      expect(new Date(response.body.data.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('streams the audio for a valid token', async () => {
      await startReading();
      const dictationId = await createDictation();
      await upload(dictationId, 'doctorA').expect(200);
      const playback = await get(`/api/v1/dictations/${dictationId}/playback`, 'reporter').expect(
        200,
      );

      const response = await request(server()).get(playback.body.data.url).expect(200);

      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(Buffer.from(response.body)).toEqual(AUDIO);
    });

    it.each([
      ['no token', ''],
      ['a forged token', '?token=1799999999999.u-doctor.forged'],
    ])('refuses the audio route with %s', async (_label, query) => {
      await startReading();
      const dictationId = await createDictation();
      await upload(dictationId, 'doctorA').expect(200);

      const response = await request(server())
        .get(`/api/v1/dictations/${dictationId}/audio${query}`)
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('refuses playback of a recording that was never uploaded', async () => {
      await startReading();
      const dictationId = await createDictation();

      await get(`/api/v1/dictations/${dictationId}/playback`, 'doctorA').expect(409);
    });

    it('refuses a study in an unauthorized hospital', async () => {
      const response = await get(
        `/api/v1/studies/${STUDY_OUT_OF_SCOPE.id}/dictations`,
        'doctorA',
      ).expect(403);

      expect(response.body.error.code).toBe('HOSPITAL_ACCESS_DENIED');
    });
  });

  describe('complete reading', () => {
    it('refuses without a completed dictation', async () => {
      await startReading();

      const response = await post(`/api/v1/studies/${STUDY}/complete-reading`, 'doctorA').expect(
        422,
      );

      expect(response.body.error.code).toBe('DICTATION_REQUIRED');
      expect(harness.studies[0]).toMatchObject({ status: 'READING' });
    });

    it('refuses while the dictation is still recording', async () => {
      await startReading();
      await createDictation();

      const response = await post(`/api/v1/studies/${STUDY}/complete-reading`, 'doctorA').expect(
        422,
      );

      expect(response.body.error.code).toBe('DICTATION_REQUIRED');
    });

    it('hands the study to the reporter queue and releases the lock', async () => {
      await startReading();
      const dictationId = await createDictation();
      await upload(dictationId, 'doctorA').expect(200);

      const response = await post(`/api/v1/studies/${STUDY}/complete-reading`, 'doctorA', {
        dictationId,
      }).expect(200);

      expect(response.body.data).toMatchObject({
        studyId: STUDY,
        status: 'WAITING_TRANSCRIPTION',
        lockReleased: true,
      });
      expect(harness.studies[0]).toMatchObject({ status: 'WAITING_TRANSCRIPTION' });
    });

    it('records both transitions in history', async () => {
      await startReading();
      const dictationId = await createDictation();
      await upload(dictationId, 'doctorA').expect(200);
      await post(`/api/v1/studies/${STUDY}/complete-reading`, 'doctorA').expect(200);

      const transitions = harness.statusHistory.map((row) => `${row.fromStatus}->${row.toStatus}`);
      expect(transitions).toEqual([
        'UNREAD->READING',
        'READING->READ',
        'READ->WAITING_TRANSCRIPTION',
      ]);
    });

    it('frees the study lock so the reporter can take it later', async () => {
      await startReading();
      const dictationId = await createDictation();
      await upload(dictationId, 'doctorA').expect(200);
      await post(`/api/v1/studies/${STUDY}/complete-reading`, 'doctorA').expect(200);

      const lock = await get(`/api/v1/studies/${STUDY}/lock`, 'doctorA').expect(200);
      expect(lock.body.data.locked).toBe(false);
    });

    it('releases the doctor assignment record', async () => {
      await startReading();
      const dictationId = await createDictation();
      await upload(dictationId, 'doctorA').expect(200);
      await post(`/api/v1/studies/${STUDY}/complete-reading`, 'doctorA').expect(200);

      expect(harness.assignments[0]).toMatchObject({
        userId: 'u-doctor',
        type: 'DOCTOR',
        releasedAt: expect.any(Date),
      });
    });

    it('refuses a doctor who does not hold the lock', async () => {
      await startReading();
      const dictationId = await createDictation();
      await upload(dictationId, 'doctorA').expect(200);

      const response = await post(`/api/v1/studies/${STUDY}/complete-reading`, 'doctorB').expect(
        423,
      );

      expect(response.body.error.code).toBe('LOCK_NOT_OWNED');
    });

    it('refuses a second completion', async () => {
      await startReading();
      const dictationId = await createDictation();
      await upload(dictationId, 'doctorA').expect(200);
      await post(`/api/v1/studies/${STUDY}/complete-reading`, 'doctorA').expect(200);

      const response = await post(`/api/v1/studies/${STUDY}/complete-reading`, 'doctorA').expect(
        409,
      );

      expect(response.body.error.code).toBe('INVALID_STATE_TRANSITION');
    });

    it.each(['reporter', 'manager'])('refuses a %s with 403', async (role) => {
      await startReading();

      const response = await post(`/api/v1/studies/${STUDY}/complete-reading`, role).expect(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });
});
