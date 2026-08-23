import request from 'supertest';
import { createTestHarness, type TestHarness } from './fixtures/auth-test-harness';
import { STUDY_IN_SCOPE_OLDEST, STUDY_OUT_OF_SCOPE } from './fixtures/study-fixtures';

/**
 * Information notes over real HTTP (TASK_QUEUE BACKEND-041).
 *
 * The two acceptance items are "no delete" and "history is preserved", so most
 * of what is asserted here is what the API refuses to do and what survives an
 * edit.
 */
describe('Information notes (e2e)', () => {
  let harness: TestHarness;
  const tokens: Record<string, string> = {};
  const STUDY = STUDY_IN_SCOPE_OLDEST.id;

  beforeEach(async () => {
    harness = await createTestHarness({
      studies: [STUDY_IN_SCOPE_OLDEST, STUDY_OUT_OF_SCOPE],
      hospitalAccess: [
        { userId: 'u-doctor', hospitalId: STUDY_IN_SCOPE_OLDEST.hospitalId },
        { userId: 'u-reporter', hospitalId: STUDY_IN_SCOPE_OLDEST.hospitalId },
        { userId: 'u-operation', hospitalId: STUDY_IN_SCOPE_OLDEST.hospitalId },
      ],
    });

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
  const auth = (role: string) => `Bearer ${tokens[role]}`;

  const post = (path: string, role: string, body?: object) =>
    request(server()).post(path).set('Authorization', auth(role)).send(body ?? {});
  const put = (path: string, role: string, body?: object) =>
    request(server()).put(path).set('Authorization', auth(role)).send(body ?? {});
  const get = (path: string, role: string) =>
    request(server()).get(path).set('Authorization', auth(role));

  const addNote = async (role: string, content: string): Promise<string> => {
    const response = await post(`/api/v1/studies/${STUDY}/information`, role, { content }).expect(
      201,
    );
    return response.body.data.id as string;
  };

  describe('create', () => {
    it('returns the created note', async () => {
      const response = await post(`/api/v1/studies/${STUDY}/information`, 'doctor', {
        content: 'Hastanin bilinen kontrast alerjisi var.',
      }).expect(201);

      expect(response.body.data).toEqual({
        id: expect.any(String),
        content: 'Hastanin bilinen kontrast alerjisi var.',
        createdAt: expect.any(String),
      });
    });

    it.each(['doctor', 'reporter', 'operation', 'manager'])(
      'lets a %s add a note',
      async (role) => {
        // All four roles may add notes (AUTH_ROLES_PERMISSIONS permission
        // matrix, "Add information note").
        await post(`/api/v1/studies/${STUDY}/information`, role, { content: 'not' }).expect(201);
      },
    );

    it('records the author role as it was at the time of writing', async () => {
      await addNote('reporter', 'raportor notu');

      const notes = await get(`/api/v1/studies/${STUDY}/information`, 'doctor').expect(200);
      expect(notes.body.data[0].author).toMatchObject({
        id: 'u-reporter',
        role: 'REPORTER',
        displayName: expect.any(String),
      });
    });

    it('writes an audit entry', async () => {
      await addNote('doctor', 'not');

      expect(harness.auditLogs.map((row) => row.eventType)).toContain('INFORMATION_NOTE_ADDED');
    });

    it('counts a brand new note as one version, not zero', async () => {
      await addNote('doctor', 'ilk');

      const notes = await get(`/api/v1/studies/${STUDY}/information`, 'doctor').expect(200);
      expect(notes.body.data[0].versionCount).toBe(1);
    });

    it('rejects an empty note', async () => {
      const response = await post(`/api/v1/studies/${STUDY}/information`, 'doctor', {
        content: '   ',
      }).expect(422);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('refuses a study in an unauthorized hospital', async () => {
      const response = await post(
        `/api/v1/studies/${STUDY_OUT_OF_SCOPE.id}/information`,
        'doctor',
        { content: 'not' },
      ).expect(403);

      expect(response.body.error.code).toBe('HOSPITAL_ACCESS_DENIED');
    });

    it('returns 404 for a study that does not exist', async () => {
      await post('/api/v1/studies/99999999-9999-4999-8999-999999999999/information', 'doctor', {
        content: 'not',
      }).expect(404);
    });
  });

  describe('list', () => {
    it('returns the notes of a study in arrival order', async () => {
      await addNote('doctor', 'birinci');
      await addNote('reporter', 'ikinci');

      const response = await get(`/api/v1/studies/${STUDY}/information`, 'operation').expect(200);

      expect(response.body.data.map((note: { content: string }) => note.content)).toEqual([
        'birinci',
        'ikinci',
      ]);
    });

    it('does not leak notes across hospitals', async () => {
      await addNote('doctor', 'gizli');

      const response = await get(
        `/api/v1/studies/${STUDY_OUT_OF_SCOPE.id}/information`,
        'doctor',
      ).expect(403);

      expect(response.body.error.code).toBe('HOSPITAL_ACCESS_DENIED');
    });
  });

  describe('update', () => {
    it('replaces the current content', async () => {
      const noteId = await addNote('doctor', 'ilk hali');

      const response = await put(`/api/v1/information/${noteId}`, 'doctor', {
        content: 'duzeltilmis hali',
      }).expect(200);

      expect(response.body.data.content).toBe('duzeltilmis hali');
    });

    it('keeps the old content as history rather than overwriting it', async () => {
      const noteId = await addNote('doctor', 'ilk hali');
      await put(`/api/v1/information/${noteId}`, 'doctor', { content: 'ikinci hali' }).expect(200);

      const versions = await get(`/api/v1/information/${noteId}/versions`, 'doctor').expect(200);

      // The acceptance item: the first content is still readable after an edit.
      expect(
        versions.body.data.map((v: { content: string; versionNumber: number }) => [
          v.versionNumber,
          v.content,
        ]),
      ).toEqual([
        [1, 'ilk hali'],
        [2, 'ikinci hali'],
      ]);
    });

    it('raises the version count on every edit', async () => {
      const noteId = await addNote('doctor', 'v1');
      await put(`/api/v1/information/${noteId}`, 'doctor', { content: 'v2' }).expect(200);
      await put(`/api/v1/information/${noteId}`, 'doctor', { content: 'v3' }).expect(200);

      const notes = await get(`/api/v1/studies/${STUDY}/information`, 'doctor').expect(200);
      expect(notes.body.data[0]).toMatchObject({ versionCount: 3, content: 'v3' });
    });

    it('lets Operation correct someone else note', async () => {
      const noteId = await addNote('doctor', 'hatali');

      await put(`/api/v1/information/${noteId}`, 'operation', { content: 'duzeltildi' }).expect(
        200,
      );
    });

    it('lets a Manager correct someone else note', async () => {
      const noteId = await addNote('doctor', 'hatali');

      await put(`/api/v1/information/${noteId}`, 'manager', { content: 'duzeltildi' }).expect(200);
    });

    it('refuses a different clinician who is neither author nor supervisor', async () => {
      const noteId = await addNote('doctor', 'hekim notu');

      const response = await put(`/api/v1/information/${noteId}`, 'reporter', {
        content: 'baskasinin notu',
      }).expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('leaves the note untouched after a refused edit', async () => {
      const noteId = await addNote('doctor', 'hekim notu');
      await put(`/api/v1/information/${noteId}`, 'reporter', { content: 'degistirildi' }).expect(
        403,
      );

      const versions = await get(`/api/v1/information/${noteId}/versions`, 'doctor').expect(200);
      expect(versions.body.data).toHaveLength(1);
      expect(versions.body.data[0].content).toBe('hekim notu');
    });

    it('records who edited whose note', async () => {
      const noteId = await addNote('doctor', 'ilk');
      await put(`/api/v1/information/${noteId}`, 'operation', { content: 'ikinci' }).expect(200);

      const entry = harness.auditLogs.find(
        (row) => row.eventType === 'INFORMATION_NOTE_UPDATED',
      ) as { metadata?: Record<string, unknown> } | undefined;

      expect(entry?.metadata).toMatchObject({ editedByAuthor: false, authorUserId: 'u-doctor' });
    });

    it('rejects an empty edit', async () => {
      const noteId = await addNote('doctor', 'dolu');

      await put(`/api/v1/information/${noteId}`, 'doctor', { content: '' }).expect(422);
    });

    it('returns 404 for a note that does not exist', async () => {
      await put('/api/v1/information/99999999-9999-4999-8999-999999999999', 'doctor', {
        content: 'x',
      }).expect(404);
    });
  });

  describe('versions', () => {
    it('names the author of each version', async () => {
      const noteId = await addNote('doctor', 'ilk');
      await put(`/api/v1/information/${noteId}`, 'operation', { content: 'ikinci' }).expect(200);

      const versions = await get(`/api/v1/information/${noteId}/versions`, 'doctor').expect(200);

      expect(versions.body.data.map((v: { createdBy: { id: string } }) => v.createdBy.id)).toEqual([
        'u-doctor',
        'u-operation',
      ]);
    });

    it('refuses a note whose study is in another hospital', async () => {
      // The note is reachable by its own id, so the hospital has to be checked
      // on this route too rather than only on the study route.
      const noteId = await addNote('doctor', 'not');
      harness.hospitalAccess.length = 0;

      const response = await get(`/api/v1/information/${noteId}/versions`, 'doctor').expect(403);
      expect(response.body.error.code).toBe('HOSPITAL_ACCESS_DENIED');
    });
  });

  describe('delete', () => {
    it('has no delete endpoint at all', async () => {
      const noteId = await addNote('doctor', 'silinemez');

      // API_CONTRACT section 71: the endpoint does not exist. Not 403 — 404,
      // because there is no route to authorize against.
      await request(server())
        .delete(`/api/v1/information/${noteId}`)
        .set('Authorization', auth('manager'))
        .expect(404);
    });

    it('survives a Manager trying every plausible delete path', async () => {
      const noteId = await addNote('doctor', 'kalici');

      for (const path of [
        `/api/v1/information/${noteId}`,
        `/api/v1/studies/${STUDY}/information/${noteId}`,
        `/api/v1/information/${noteId}/versions`,
      ]) {
        await request(server())
          .delete(path)
          .set('Authorization', auth('manager'))
          .expect(404);
      }

      const versions = await get(`/api/v1/information/${noteId}/versions`, 'doctor').expect(200);
      expect(versions.body.data).toHaveLength(1);
    });
  });
});
