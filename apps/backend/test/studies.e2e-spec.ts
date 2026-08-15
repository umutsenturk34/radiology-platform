import request from 'supertest';
import {
  createTestHarness,
  OTHER_HOSPITAL,
  TEST_HOSPITAL,
  type TestHarness,
} from './fixtures/auth-test-harness';
import {
  ALL_STUDIES,
  STUDY_IN_SCOPE_NEWEST,
  STUDY_IN_SCOPE_OLDEST,
  STUDY_OUT_OF_SCOPE,
} from './fixtures/study-fixtures';

/**
 * Study reads and hospital scope over real HTTP
 * (TASK_QUEUE BACKEND-008 and BACKEND-009).
 *
 * Doctor, Reporter and Operation are granted TEST_HOSPITAL only; nobody is
 * granted OTHER_HOSPITAL, and Manager sees everything by the documented pilot
 * default (docs/AUTH_ROLES_PERMISSIONS.md section 46).
 */
describe('Studies (e2e)', () => {
  let harness: TestHarness;
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    harness = await createTestHarness({ studies: ALL_STUDIES });

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

  describe('GET /studies — hospital scope', () => {
    it.each(['doctor', 'reporter', 'operation'])(
      'hides another hospital from a %s',
      async (role) => {
        const response = await get('/api/v1/studies', role).expect(200);

        const ids = response.body.data.map((item: { id: string }) => item.id);
        expect(ids).toEqual(
          expect.arrayContaining([STUDY_IN_SCOPE_OLDEST.id, STUDY_IN_SCOPE_NEWEST.id]),
        );
        expect(ids).not.toContain(STUDY_OUT_OF_SCOPE.id);
        expect(response.body.meta.total).toBe(2);
      },
    );

    it('shows every hospital to a Manager', async () => {
      const response = await get('/api/v1/studies', 'manager').expect(200);

      expect(response.body.meta.total).toBe(3);
      expect(response.body.data.map((item: { id: string }) => item.id)).toContain(
        STUDY_OUT_OF_SCOPE.id,
      );
    });

    it('refuses a hospitalId filter naming an unauthorized hospital', async () => {
      const response = await get(
        `/api/v1/studies?hospitalId=${OTHER_HOSPITAL.id}`,
        'doctor',
      ).expect(403);

      expect(response.body.error.code).toBe('HOSPITAL_ACCESS_DENIED');
    });

    it('accepts a hospitalId filter naming an authorized hospital', async () => {
      const response = await get(
        `/api/v1/studies?hospitalId=${TEST_HOSPITAL.id}`,
        'doctor',
      ).expect(200);

      expect(response.body.meta.total).toBe(2);
    });

    it('requires authentication', async () => {
      const response = await get('/api/v1/studies').expect(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('GET /studies — query behaviour', () => {
    it('returns the list envelope with pagination meta', async () => {
      const response = await get('/api/v1/studies', 'doctor').expect(200);

      expect(response.body.meta).toEqual({ page: 1, pageSize: 25, total: 2, totalPages: 1 });
    });

    it('orders by arrivalAt ascending by default, which is the FIFO order', async () => {
      const response = await get('/api/v1/studies', 'doctor').expect(200);

      expect(response.body.data.map((item: { id: string }) => item.id)).toEqual([
        STUDY_IN_SCOPE_OLDEST.id,
        STUDY_IN_SCOPE_NEWEST.id,
      ]);
    });

    it('supports descending arrival order', async () => {
      const response = await get(
        '/api/v1/studies?sortBy=arrivalAt&sortOrder=desc',
        'doctor',
      ).expect(200);

      expect(response.body.data[0].id).toBe(STUDY_IN_SCOPE_NEWEST.id);
    });

    it('paginates', async () => {
      const response = await get('/api/v1/studies?page=2&pageSize=1', 'doctor').expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].id).toBe(STUDY_IN_SCOPE_NEWEST.id);
      expect(response.body.meta).toEqual({ page: 2, pageSize: 1, total: 2, totalPages: 2 });
    });

    it('filters by status', async () => {
      const response = await get('/api/v1/studies?status=UNREAD', 'doctor').expect(200);

      expect(response.body.data.map((item: { id: string }) => item.id)).toEqual([
        STUDY_IN_SCOPE_OLDEST.id,
      ]);
    });

    it('filters by category', async () => {
      const response = await get('/api/v1/studies?category=NORMAL', 'doctor').expect(200);

      expect(response.body.data.map((item: { id: string }) => item.id)).toEqual([
        STUDY_IN_SCOPE_NEWEST.id,
      ]);
    });

    it('filters by pool preset', async () => {
      const response = await get(
        '/api/v1/studies?pool=WAITING_TRANSCRIPTION',
        'reporter',
      ).expect(200);

      expect(response.body.data.map((item: { id: string }) => item.id)).toEqual([
        STUDY_IN_SCOPE_NEWEST.id,
      ]);
    });

    it('searches by accession number', async () => {
      const response = await get('/api/v1/studies?search=ACC-NEW', 'doctor').expect(200);

      expect(response.body.data.map((item: { id: string }) => item.id)).toEqual([
        STUDY_IN_SCOPE_NEWEST.id,
      ]);
    });

    it('searches by patient name without escaping the hospital scope', async () => {
      const response = await get('/api/v1/studies?search=Yabanci', 'doctor').expect(200);

      // The matching study lives in an unauthorized hospital.
      expect(response.body.data).toEqual([]);
      expect(response.body.meta.total).toBe(0);
    });

    it.each([
      ['an unknown status', 'status=NOT_A_STATUS'],
      ['an unknown category', 'category=NOT_A_CATEGORY'],
      ['an unknown pool', 'pool=NOT_A_POOL'],
      ['a non-numeric page', 'page=abc'],
      ['a pageSize above the ceiling', 'pageSize=500'],
      ['an unsortable field', 'sortBy=passwordHash'],
      ['an invalid sort order', 'sortOrder=sideways'],
      ['a non-UUID hospitalId', 'hospitalId=not-a-uuid'],
      ['an unknown parameter', 'nonsense=1'],
    ])('rejects %s with 422', async (_label, queryString) => {
      const response = await get(`/api/v1/studies?${queryString}`, 'doctor').expect(422);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /studies/:studyId', () => {
    it('returns the detail for a study in an authorized hospital', async () => {
      const response = await get(`/api/v1/studies/${STUDY_IN_SCOPE_OLDEST.id}`, 'doctor').expect(
        200,
      );

      expect(response.body.data).toMatchObject({
        id: STUDY_IN_SCOPE_OLDEST.id,
        accessionNumber: 'ACC-OLD-001',
        status: 'UNREAD',
        hospital: { code: TEST_HOSPITAL.code },
        patient: { displayName: 'Test Erken', externalPatientId: 'TEST-OLD' },
      });
    });

    it('never exposes persistence-only fields', async () => {
      const response = await get(`/api/v1/studies/${STUDY_IN_SCOPE_OLDEST.id}`, 'doctor').expect(
        200,
      );

      expect(response.body.data).not.toHaveProperty('hospitalId');
      expect(response.body.data).not.toHaveProperty('patientId');
      expect(response.body.data).not.toHaveProperty('assignedDoctorId');
    });

    it.each(['doctor', 'reporter', 'operation'])(
      'refuses a %s opening a study by UUID in an unauthorized hospital',
      async (role) => {
        const response = await get(`/api/v1/studies/${STUDY_OUT_OF_SCOPE.id}`, role).expect(403);

        expect(response.body.error.code).toBe('HOSPITAL_ACCESS_DENIED');
        // The response carries no study data at all.
        expect(response.body).not.toHaveProperty('data');
      },
    );

    it('lets a Manager open any hospital', async () => {
      await get(`/api/v1/studies/${STUDY_OUT_OF_SCOPE.id}`, 'manager').expect(200);
    });

    it('returns 404 for a study that does not exist', async () => {
      const response = await get(
        '/api/v1/studies/99999999-9999-4999-8999-999999999999',
        'doctor',
      ).expect(404);

      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('rejects a malformed id', async () => {
      await get('/api/v1/studies/not-a-uuid', 'doctor').expect(422);
    });

    it('requires authentication', async () => {
      const response = await get(`/api/v1/studies/${STUDY_IN_SCOPE_OLDEST.id}`).expect(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });
});
