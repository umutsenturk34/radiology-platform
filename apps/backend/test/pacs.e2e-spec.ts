import request from 'supertest';
import { createTestHarness, type TestHarness } from './fixtures/auth-test-harness';
import { STUDY_IN_SCOPE_OLDEST, STUDY_OUT_OF_SCOPE } from './fixtures/study-fixtures';

/**
 * PACS viewer and series over real HTTP (TASK_QUEUE BACKEND-019, BACKEND-020).
 *
 * The e2e environment configures no test viewer, so the honest answer to
 * "give me a viewer" here is "there is none" — and asserting that is the point:
 * the endpoint works, and it does not invent a URL to look successful.
 */
describe('PACS (e2e)', () => {
  let harness: TestHarness;
  const tokens: Record<string, string> = {};
  const STUDY = STUDY_IN_SCOPE_OLDEST.id;

  beforeEach(async () => {
    harness = await createTestHarness({
      studies: [{ ...STUDY_IN_SCOPE_OLDEST, studyInstanceUid: null }, STUDY_OUT_OF_SCOPE],
      hospitalAccess: [
        { userId: 'u-doctor', hospitalId: STUDY_IN_SCOPE_OLDEST.hospitalId },
        { userId: 'u-reporter', hospitalId: STUDY_IN_SCOPE_OLDEST.hospitalId },
      ],
    });

    for (const [key, email] of [
      ['doctor', 'doctor@test.local'],
      ['reporter', 'reporter@test.local'],
    ] as const) {
      tokens[key] = await harness.accessTokenFor(email);
    }
  });

  afterEach(async () => {
    await harness.close();
  });

  const get = (path: string, role: string) =>
    request(harness.app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${tokens[role]}`);

  describe('GET /studies/:studyId/pacs/viewer', () => {
    it('answers with the contract shape', async () => {
      const response = await get(`/api/v1/studies/${STUDY}/pacs/viewer`, 'doctor').expect(200);

      // API_CONTRACT section 36.
      expect(response.body.data).toMatchObject({
        available: expect.any(Boolean),
        studyInstanceUid: expect.any(String),
      });
      expect(response.body.data).toHaveProperty('viewerUrl');
      expect(response.body.data).toHaveProperty('expiresAt');
    });

    it('says there is no viewer instead of inventing one', async () => {
      const response = await get(`/api/v1/studies/${STUDY}/pacs/viewer`, 'doctor').expect(200);

      expect(response.body.data).toMatchObject({
        available: false,
        viewerUrl: null,
        expiresAt: null,
        reason: 'PACS_VIEWER_NOT_CONFIGURED',
      });
    });

    it('never returns PACS credentials to the client', async () => {
      const response = await get(`/api/v1/studies/${STUDY}/pacs/viewer`, 'doctor').expect(200);

      // Section 36: the frontend must not receive PACS secrets.
      expect(Object.keys(response.body.data).sort()).toEqual([
        'available',
        'expiresAt',
        'reason',
        'studyInstanceUid',
        'viewerUrl',
      ]);
    });

    it('remembers the resolved study instance UID on the study', async () => {
      const response = await get(`/api/v1/studies/${STUDY}/pacs/viewer`, 'doctor').expect(200);

      // The platform keeps identifiers, never the images
      // (docs/INTEGRATIONS.md section 22).
      expect(harness.studies[0].studyInstanceUid).toBe(response.body.data.studyInstanceUid);
    });

    it('does not overwrite a UID the study already had', async () => {
      const known = '1.2.840.113619.2.55.3.9999';
      harness.studies[0].studyInstanceUid = known;

      const response = await get(`/api/v1/studies/${STUDY}/pacs/viewer`, 'doctor').expect(200);

      // A differing answer from PACS is a matching problem to investigate, not
      // something to apply silently.
      expect(response.body.data.studyInstanceUid).toBe(known);
      expect(harness.studies[0].studyInstanceUid).toBe(known);
    });

    it('is readable by the reporter too', async () => {
      await get(`/api/v1/studies/${STUDY}/pacs/viewer`, 'reporter').expect(200);
    });

    it('refuses a study in an unauthorized hospital', async () => {
      const response = await get(
        `/api/v1/studies/${STUDY_OUT_OF_SCOPE.id}/pacs/viewer`,
        'doctor',
      ).expect(403);

      expect(response.body.error.code).toBe('HOSPITAL_ACCESS_DENIED');
    });

    it('returns 404 for a study that does not exist', async () => {
      await get(
        '/api/v1/studies/99999999-9999-4999-8999-999999999999/pacs/viewer',
        'doctor',
      ).expect(404);
    });

    it('rejects a studyId that is not a UUID with 422', async () => {
      const response = await get('/api/v1/studies/not-a-uuid/pacs/viewer', 'doctor').expect(422);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('requires authentication', async () => {
      await request(harness.app.getHttpServer())
        .get(`/api/v1/studies/${STUDY}/pacs/viewer`)
        .expect(401);
    });
  });

  describe('GET /studies/:studyId/pacs/series', () => {
    it('lists the series metadata', async () => {
      const response = await get(`/api/v1/studies/${STUDY}/pacs/series`, 'doctor').expect(200);

      // API_CONTRACT section 37.
      expect(response.body.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            seriesInstanceUid: expect.any(String),
            seriesNumber: expect.any(Number),
            modality: expect.any(String),
            imageCount: expect.any(Number),
          }),
        ]),
      );
    });

    it('agrees with the viewer about which study it is describing', async () => {
      const viewer = await get(`/api/v1/studies/${STUDY}/pacs/viewer`, 'doctor').expect(200);
      const series = await get(`/api/v1/studies/${STUDY}/pacs/series`, 'doctor').expect(200);

      for (const entry of series.body.data) {
        expect(entry.seriesInstanceUid.startsWith(viewer.body.data.studyInstanceUid)).toBe(true);
      }
    });

    it('refuses a study in an unauthorized hospital', async () => {
      const response = await get(
        `/api/v1/studies/${STUDY_OUT_OF_SCOPE.id}/pacs/series`,
        'doctor',
      ).expect(403);

      expect(response.body.error.code).toBe('HOSPITAL_ACCESS_DENIED');
    });
  });
});
