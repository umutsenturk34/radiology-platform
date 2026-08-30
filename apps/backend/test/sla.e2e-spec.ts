import request from 'supertest';
import { TEST_HOSPITAL, createTestHarness, type TestHarness } from './fixtures/auth-test-harness';
import { buildStudy } from './fixtures/study-fixtures';

/**
 * The SLA engine over real HTTP (TASK_QUEUE BACKEND-039).
 *
 * Deadlines are built relative to the moment the suite starts rather than from
 * fixed calendar dates, so the derived state is what is asserted — a fixture
 * pinned to a date drifts into OVERDUE as the repository ages.
 */
describe('SLA (e2e)', () => {
  let harness: TestHarness;
  let doctorToken: string;

  const MINUTE = 60_000;
  const NOW = Date.now();
  const deadlineIn = (minutes: number) => new Date(NOW + minutes * MINUTE);

  // The seeded warning window is 20 minutes, so 10 minutes out is inside the
  // band and 90 minutes out is comfortably outside it.
  const NORMAL_STUDY = buildStudy({
    id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
    hospital: TEST_HOSPITAL,
    accessionNumber: 'SLA-NORMAL',
    status: 'UNREAD',
    category: 'ACIL',
    arrivalAt: new Date(NOW).toISOString(),
    patientLastName: 'Normal',
    externalPatientId: 'SLA-1',
    slaDeadlineAt: deadlineIn(90),
  });

  const WARNING_STUDY = buildStudy({
    id: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
    hospital: TEST_HOSPITAL,
    accessionNumber: 'SLA-WARNING',
    status: 'UNREAD',
    category: 'ACIL',
    arrivalAt: new Date(NOW).toISOString(),
    patientLastName: 'Uyari',
    externalPatientId: 'SLA-2',
    slaDeadlineAt: deadlineIn(10),
  });

  const OVERDUE_STUDY = buildStudy({
    id: 'cccccccc-3333-4333-8333-cccccccccccc',
    hospital: TEST_HOSPITAL,
    accessionNumber: 'SLA-OVERDUE',
    status: 'WAITING_TRANSCRIPTION',
    category: 'ACIL',
    arrivalAt: new Date(NOW - 200 * MINUTE).toISOString(),
    patientLastName: 'Gecikmis',
    externalPatientId: 'SLA-3',
    slaDeadlineAt: deadlineIn(-30),
  });

  /** Approved 10 minutes after its deadline: finished, and finished late. */
  const COMPLETED_LATE_STUDY = buildStudy({
    id: 'dddddddd-4444-4444-8444-dddddddddddd',
    hospital: TEST_HOSPITAL,
    accessionNumber: 'SLA-COMPLETED',
    status: 'HBYS_FAILED',
    category: 'ACIL',
    arrivalAt: new Date(NOW - 300 * MINUTE).toISOString(),
    patientLastName: 'Tamamlanmis',
    externalPatientId: 'SLA-4',
    slaDeadlineAt: deadlineIn(-120),
    finalizedAt: new Date(NOW - 110 * MINUTE),
  });

  /** YOGUN_BAKIM has no seeded policy, so it arrives without a deadline. */
  const NO_POLICY_STUDY = buildStudy({
    id: 'eeeeeeee-5555-4555-8555-eeeeeeeeeeee',
    hospital: TEST_HOSPITAL,
    accessionNumber: 'SLA-NO-POLICY',
    status: 'UNREAD',
    category: 'YOGUN_BAKIM',
    arrivalAt: new Date(NOW).toISOString(),
    patientLastName: 'Politikasiz',
    externalPatientId: 'SLA-5',
    slaDeadlineAt: null,
  });

  beforeEach(async () => {
    harness = await createTestHarness({
      studies: [
        NORMAL_STUDY,
        WARNING_STUDY,
        OVERDUE_STUDY,
        COMPLETED_LATE_STUDY,
        NO_POLICY_STUDY,
      ],
      // The study detail reads the lock alongside the study and fails closed
      // when Redis is unreachable, so the suite provides one.
      withRedis: true,
    });
    doctorToken = await harness.accessTokenFor('doctor@test.local');
  });

  afterEach(async () => {
    await harness.close();
  });

  const get = (path: string) =>
    request(harness.app.getHttpServer()).get(path).set('Authorization', `Bearer ${doctorToken}`);

  /** Accession -> sla, so assertions read by study rather than by array index. */
  const slaByAccession = async (path = '/api/v1/studies?pageSize=50') => {
    const response = await get(path).expect(200);
    const entries = (response.body.data as Array<{ accessionNumber: string; sla: unknown }>).map(
      (item) => [item.accessionNumber, item.sla] as const,
    );
    return Object.fromEntries(entries) as Record<string, Record<string, unknown>>;
  };

  describe('derived state on the list', () => {
    it('reports NORMAL with the time still left', async () => {
      const sla = await slaByAccession();

      expect(sla['SLA-NORMAL']).toMatchObject({
        state: 'NORMAL',
        overdueSeconds: 0,
        completedAt: null,
        deadlineAt: deadlineIn(90).toISOString(),
      });
      // Derived against a live clock, so assert the band rather than a value.
      expect(sla['SLA-NORMAL'].remainingSeconds).toBeGreaterThan(80 * 60);
      expect(sla['SLA-NORMAL'].remainingSeconds).toBeLessThanOrEqual(90 * 60);
    });

    it('reports WARNING inside the 20 minute band', async () => {
      const sla = await slaByAccession();

      expect(sla['SLA-WARNING']).toMatchObject({ state: 'WARNING', overdueSeconds: 0 });
      expect(sla['SLA-WARNING'].remainingSeconds).toBeLessThanOrEqual(10 * 60);
    });

    it('reports OVERDUE with how far past the deadline it is', async () => {
      const sla = await slaByAccession();

      expect(sla['SLA-OVERDUE']).toMatchObject({ state: 'OVERDUE', remainingSeconds: 0 });
      expect(sla['SLA-OVERDUE'].overdueSeconds).toBeGreaterThanOrEqual(29 * 60);
    });

    it('reports COMPLETED and keeps the breach on the record', async () => {
      const sla = await slaByAccession();

      // Approved 10 minutes late, and the study is now HBYS_FAILED. The HBYS
      // failure must not make it clinically late again
      // (docs/WORKFLOW_STATE_MACHINE.md section 61), so the numbers are frozen
      // at approval instead of growing with the wall clock.
      expect(sla['SLA-COMPLETED']).toEqual({
        state: 'COMPLETED',
        deadlineAt: deadlineIn(-120).toISOString(),
        completedAt: new Date(NOW - 110 * MINUTE).toISOString(),
        remainingSeconds: 0,
        overdueSeconds: 600,
      });
    });

    it('derives nothing for a category with no policy', async () => {
      const sla = await slaByAccession();

      // YOGUN_BAKIM: the duration is undefined (BLOCKED_SPEC) and must not be
      // invented, so the study carries no state rather than a wrong one.
      expect(sla['SLA-NO-POLICY']).toEqual({
        state: null,
        deadlineAt: null,
        completedAt: null,
        remainingSeconds: null,
        overdueSeconds: null,
      });
    });
  });

  describe('derived state on the detail', () => {
    it('matches what the list reports', async () => {
      const response = await get(`/api/v1/studies/${OVERDUE_STUDY.id}`).expect(200);

      expect(response.body.data.sla).toMatchObject({
        state: 'OVERDUE',
        remainingSeconds: 0,
        completedAt: null,
      });
    });
  });

  describe('slaState filter', () => {
    const accessionsFor = async (state: string) => {
      const response = await get(`/api/v1/studies?slaState=${state}&pageSize=50`).expect(200);
      return (response.body.data as Array<{ accessionNumber: string }>)
        .map((item) => item.accessionNumber)
        .sort();
    };

    it('finds the studies Operation is about to miss', async () => {
      // docs/API_CONTRACT.md section 92.
      expect(await accessionsFor('WARNING')).toEqual(['SLA-WARNING']);
    });

    it('finds the studies already missed', async () => {
      expect(await accessionsFor('OVERDUE')).toEqual(['SLA-OVERDUE']);
    });

    it('finds the studies still comfortably on time', async () => {
      expect(await accessionsFor('NORMAL')).toEqual(['SLA-NORMAL']);
    });

    it('finds the finished ones, late or not', async () => {
      expect(await accessionsFor('COMPLETED')).toEqual(['SLA-COMPLETED']);
    });

    it('never returns a study with no deadline', async () => {
      for (const state of ['NORMAL', 'WARNING', 'OVERDUE', 'COMPLETED']) {
        expect(await accessionsFor(state)).not.toContain('SLA-NO-POLICY');
      }
    });

    it('keeps the pagination meta consistent with the filter', async () => {
      const response = await get('/api/v1/studies?slaState=OVERDUE').expect(200);

      expect(response.body.meta).toMatchObject({ total: 1, totalPages: 1 });
    });

    it('narrows rather than replaces the free-text search', async () => {
      // The search owns the top-level OR; a filter that clobbered it would
      // widen the result set instead of narrowing it.
      const matching = await get('/api/v1/studies?slaState=OVERDUE&search=Gecikmis').expect(200);
      expect(matching.body.data).toHaveLength(1);

      const conflicting = await get('/api/v1/studies?slaState=OVERDUE&search=Normal').expect(200);
      expect(conflicting.body.data).toHaveLength(0);
    });

    it('rejects an unknown state with 422', async () => {
      const response = await get('/api/v1/studies?slaState=LATE_ISH').expect(422);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
