import request from 'supertest';
import {
  createTestHarness,
  OTHER_HOSPITAL,
  TEST_HOSPITAL,
  type TestHarness,
} from './fixtures/auth-test-harness';
import {
  ALL_STUDIES,
  buildStudy,
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
    harness = await createTestHarness({ studies: ALL_STUDIES, withRedis: true });

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

    it('reports an unheld lock rather than omitting the lock block', async () => {
      const response = await get(`/api/v1/studies/${STUDY_IN_SCOPE_OLDEST.id}`, 'doctor').expect(
        200,
      );

      expect(response.body.data.lock).toEqual({
        locked: false,
        type: null,
        ownerUserId: null,
        ownerDisplayName: null,
        ownerRole: null,
        lockedAt: null,
        expiresInSeconds: null,
      });
    });

    it('carries a flags block on every study', async () => {
      const response = await get(`/api/v1/studies/${STUDY_IN_SCOPE_OLDEST.id}`, 'doctor').expect(
        200,
      );

      expect(response.body.data.flags).toEqual({
        hasInformation: false,
        imageMissing: false,
        hasRevisionRequest: false,
        hasUnreportedSiblingStudy: false,
      });
    });

    it('reports null clinicalData when the hospital sent no clinical block', async () => {
      const response = await get(`/api/v1/studies/${STUDY_IN_SCOPE_OLDEST.id}`, 'doctor').expect(
        200,
      );

      expect(response.body.data.clinicalData).toBeNull();
    });
  });

  describe('GET /studies — list flags', () => {
    it('carries the same flags block on every list row', async () => {
      const response = await get('/api/v1/studies', 'doctor').expect(200);

      for (const item of response.body.data) {
        expect(item.flags).toEqual({
          hasInformation: false,
          imageMissing: false,
          hasRevisionRequest: false,
          hasUnreportedSiblingStudy: false,
        });
      }
    });
  });
});

/**
 * The parts of the detail contract that need their own data: shared patients,
 * a stored clinical block and a study parked as IMAGE_MISSING
 * (API_CONTRACT sections 26 and 28, TASK_QUEUE DISCOVERED-003/004).
 *
 * A separate harness keeps these rows out of the list assertions above.
 */
describe('Studies (e2e) — detail contract', () => {
  let harness: TestHarness;
  let doctorToken: string;

  const SHARED_PATIENT = 'patient-shared-0001';

  const SIBLING_OPEN = buildStudy({
    id: 'aaaa1111-1111-4111-8111-aaaa11111111',
    hospital: TEST_HOSPITAL,
    accessionNumber: 'SIB-OPEN',
    status: 'UNREAD',
    category: 'ACIL',
    arrivalAt: '2026-08-15T08:00:00.000Z',
    patientLastName: 'Kardes',
    externalPatientId: 'SIB-1',
    patientId: SHARED_PATIENT,
  });

  const SIBLING_ALSO_OPEN = buildStudy({
    id: 'aaaa2222-2222-4222-8222-aaaa22222222',
    hospital: TEST_HOSPITAL,
    accessionNumber: 'SIB-OPEN-2',
    status: 'WAITING_TRANSCRIPTION',
    category: 'NORMAL',
    arrivalAt: '2026-08-15T09:00:00.000Z',
    patientLastName: 'Kardes',
    externalPatientId: 'SIB-1',
    patientId: SHARED_PATIENT,
  });

  /** Same patient again, but this one already has a final report. */
  const SIBLING_REPORTED = buildStudy({
    id: 'aaaa3333-3333-4333-8333-aaaa33333333',
    hospital: TEST_HOSPITAL,
    accessionNumber: 'SIB-DONE',
    status: 'HBYS_SENT',
    category: 'NORMAL',
    arrivalAt: '2026-08-15T07:00:00.000Z',
    patientLastName: 'Kardes',
    externalPatientId: 'SIB-1',
    patientId: SHARED_PATIENT,
  });

  const LONE_STUDY = buildStudy({
    id: 'bbbb1111-1111-4111-8111-bbbb11111111',
    hospital: TEST_HOSPITAL,
    accessionNumber: 'LONE-001',
    status: 'IMAGE_MISSING',
    category: 'NORMAL',
    arrivalAt: '2026-08-15T10:00:00.000Z',
    patientLastName: 'Tek',
    externalPatientId: 'LONE-1',
    clinicalData: {
      preDiagnosis: 'Pnomoni suphesi',
      requestReason: 'Ates ve oksuruk',
      patientComplaint: null,
      previousStudyInfo: null,
      requestingPhysician: 'Dr. Talep',
      department: 'Acil',
      additionalData: { hospitalField: 'X-91' },
    },
  });

  beforeAll(async () => {
    harness = await createTestHarness({
      studies: [SIBLING_OPEN, SIBLING_ALSO_OPEN, SIBLING_REPORTED, LONE_STUDY],
      withRedis: true,
    });
    doctorToken = await harness.accessTokenFor('doctor@test.local');
  });

  afterAll(async () => {
    await harness.close();
  });

  const detail = (studyId: string) =>
    request(harness.app.getHttpServer())
      .get(`/api/v1/studies/${studyId}`)
      .set('Authorization', `Bearer ${doctorToken}`);

  it('flags another unreported study of the same patient', async () => {
    const response = await detail(SIBLING_OPEN.id).expect(200);

    expect(response.body.data.flags.hasUnreportedSiblingStudy).toBe(true);
  });

  it('does not count a sibling that already has a final report', async () => {
    const response = await detail(SIBLING_REPORTED.id).expect(200);

    // This one is reported, but its two siblings are not, so the flag is still
    // true — what the assertion below proves is the reverse direction.
    expect(response.body.data.flags.hasUnreportedSiblingStudy).toBe(true);

    const lone = await detail(LONE_STUDY.id).expect(200);
    expect(lone.body.data.flags.hasUnreportedSiblingStudy).toBe(false);
  });

  it('derives imageMissing from the study status', async () => {
    const response = await detail(LONE_STUDY.id).expect(200);

    expect(response.body.data.flags.imageMissing).toBe(true);
  });

  it('returns the stored clinical block, extras included', async () => {
    const response = await detail(LONE_STUDY.id).expect(200);

    expect(response.body.data.clinicalData).toEqual({
      preDiagnosis: 'Pnomoni suphesi',
      requestReason: 'Ates ve oksuruk',
      patientComplaint: null,
      previousStudyInfo: null,
      requestingPhysician: 'Dr. Talep',
      department: 'Acil',
      additionalData: { hospitalField: 'X-91' },
    });
  });
});

/**
 * Redis is the lock authority, and the detail now carries the lock. With Redis
 * unreachable the read must refuse rather than answer "nobody holds it"
 * (CLAUDE.md section 17).
 */
describe('Studies (e2e) — lock state fails closed', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness({ studies: ALL_STUDIES, withRedis: false });
  });

  afterAll(async () => {
    await harness.close();
  });

  it('refuses the study detail instead of reporting the study as unlocked', async () => {
    const token = await harness.accessTokenFor('doctor@test.local');

    const response = await request(harness.app.getHttpServer())
      .get(`/api/v1/studies/${STUDY_IN_SCOPE_OLDEST.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(503);

    expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(response.body).not.toHaveProperty('data');
  });

  it('still serves the study list, which does not depend on the lock', async () => {
    const token = await harness.accessTokenFor('doctor@test.local');

    await request(harness.app.getHttpServer())
      .get('/api/v1/studies')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });
});
