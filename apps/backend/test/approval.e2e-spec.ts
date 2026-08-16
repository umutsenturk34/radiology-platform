import request from 'supertest';
import { createTestHarness, type TestHarness } from './fixtures/auth-test-harness';
import { STUDY_IN_SCOPE_OLDEST, STUDY_OUT_OF_SCOPE } from './fixtures/study-fixtures';

/**
 * Doctor approval and finalization over real HTTP
 * (TASK_QUEUE BACKEND-030, BACKEND-031, BACKEND-032).
 *
 * The safety rules under test are the ones CLAUDE.md sections 22 and 62 call
 * mandatory: only the assigned doctor finalizes, a reporter never does, an
 * operation user never does, and a manager does not gain clinical authority by
 * being a manager.
 */
describe('Approval (e2e)', () => {
  let harness: TestHarness;
  const tokens: Record<string, string> = {};
  const STUDY = STUDY_IN_SCOPE_OLDEST.id;
  const REPORT_TEXT = 'Toraks BT: patolojik bulgu izlenmedi.';

  beforeEach(async () => {
    harness = await createTestHarness({
      withRedis: true,
      studies: [
        { ...STUDY_IN_SCOPE_OLDEST, status: 'WAITING_TRANSCRIPTION' },
        { ...STUDY_OUT_OF_SCOPE, status: 'WAITING_TRANSCRIPTION' },
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

  /** Runs the reporter half so the study reaches WAITING_APPROVAL. */
  async function submitReport(content = REPORT_TEXT) {
    await post(`/api/v1/studies/${STUDY}/start-transcription`, 'reporter').expect(200);
    await post(`/api/v1/studies/${STUDY}/submit-report`, 'reporter', { content }).expect(200);
  }

  describe('start approval', () => {
    it('gives the doctor the approval lock without changing the study status', async () => {
      await submitReport();

      const response = await post(`/api/v1/studies/${STUDY}/start-approval`, 'doctorA').expect(200);

      expect(response.body.data).toMatchObject({
        studyId: STUDY,
        // Approval is not a separate workflow state.
        status: 'WAITING_APPROVAL',
        lock: { ownerUserId: 'u-doctor', ownerRole: 'DOCTOR' },
        report: { status: 'WAITING_APPROVAL', currentVersion: { content: REPORT_TEXT } },
      });
      expect(harness.studies[0]).toMatchObject({ status: 'WAITING_APPROVAL' });
    });

    it('refuses a second doctor with 423', async () => {
      await submitReport();
      await post(`/api/v1/studies/${STUDY}/start-approval`, 'doctorA').expect(200);

      const response = await post(`/api/v1/studies/${STUDY}/start-approval`, 'doctorB').expect(423);
      expect(response.body.error.code).toBe('STUDY_LOCKED');
    });

    it.each(['reporter', 'operation', 'manager'])('refuses a %s with 403', async (role) => {
      await submitReport();

      const response = await post(`/api/v1/studies/${STUDY}/start-approval`, role).expect(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('refuses a study that is not waiting for approval', async () => {
      const response = await post(`/api/v1/studies/${STUDY}/start-approval`, 'doctorA').expect(409);
      expect(response.body.error.code).toBe('INVALID_STATE_TRANSITION');
    });

    it('refuses a study in an unauthorized hospital', async () => {
      const response = await post(
        `/api/v1/studies/${STUDY_OUT_OF_SCOPE.id}/start-approval`,
        'doctorA',
      ).expect(403);

      expect(response.body.error.code).toBe('HOSPITAL_ACCESS_DENIED');
    });
  });

  describe('approval draft', () => {
    it('records a doctor correction as a new version, keeping the reporter text', async () => {
      await submitReport();
      await post(`/api/v1/studies/${STUDY}/start-approval`, 'doctorA').expect(200);

      const response = await put(`/api/v1/studies/${STUDY}/report/approval-draft`, 'doctorA', {
        content: 'Hekim tarafindan duzeltilmis metin.',
      }).expect(200);

      expect(response.body.data.versionNumber).toBe(2);
      // The reporter's completed version is still there, unchanged.
      expect(harness.reportVersions[0]).toMatchObject({
        versionNumber: 1,
        content: REPORT_TEXT,
        status: 'COMPLETED',
      });
      expect(harness.reportVersions[1]).toMatchObject({
        versionNumber: 2,
        content: 'Hekim tarafindan duzeltilmis metin.',
        createdBy: 'u-doctor',
      });
    });

    it('keeps editing the same version on a second save', async () => {
      await submitReport();
      await post(`/api/v1/studies/${STUDY}/start-approval`, 'doctorA').expect(200);
      await put(`/api/v1/studies/${STUDY}/report/approval-draft`, 'doctorA', {
        content: 'ilk duzeltme',
      }).expect(200);

      const response = await put(`/api/v1/studies/${STUDY}/report/approval-draft`, 'doctorA', {
        content: 'ikinci duzeltme',
      }).expect(200);

      expect(response.body.data.versionNumber).toBe(2);
      expect(harness.reportVersions).toHaveLength(2);
      expect(harness.reportVersions[1]).toMatchObject({ content: 'ikinci duzeltme' });
    });

    it('refuses a doctor without the approval lock', async () => {
      await submitReport();
      await post(`/api/v1/studies/${STUDY}/start-approval`, 'doctorA').expect(200);

      const response = await put(`/api/v1/studies/${STUDY}/report/approval-draft`, 'doctorB', {
        content: 'baska hekim',
      }).expect(423);

      expect(response.body.error.code).toBe('LOCK_NOT_OWNED');
    });

    it.each(['reporter', 'manager'])('refuses a %s with 403', async (role) => {
      await submitReport();
      await post(`/api/v1/studies/${STUDY}/start-approval`, 'doctorA').expect(200);

      await put(`/api/v1/studies/${STUDY}/report/approval-draft`, role, { content: 'x' }).expect(
        403,
      );
    });
  });

  describe('return to reporter', () => {
    it('sends the study back and releases the lock', async () => {
      await submitReport();
      await post(`/api/v1/studies/${STUDY}/start-approval`, 'doctorA').expect(200);

      const response = await post(`/api/v1/studies/${STUDY}/return-to-reporter`, 'doctorA', {
        reason: 'Bulgular bolumu tekrar duzenlensin.',
      }).expect(200);

      expect(response.body.data).toMatchObject({
        status: 'WAITING_TRANSCRIPTION',
        lockReleased: true,
      });
      expect(harness.studies[0]).toMatchObject({ status: 'WAITING_TRANSCRIPTION' });
      expect(harness.auditLogs.map((row) => row.eventType)).toContain(
        'REPORT_RETURNED_TO_REPORTER',
      );
    });

    it('requires a reason', async () => {
      await submitReport();
      await post(`/api/v1/studies/${STUDY}/start-approval`, 'doctorA').expect(200);

      const response = await post(`/api/v1/studies/${STUDY}/return-to-reporter`, 'doctorA').expect(
        422,
      );

      expect(response.body.error.details.fields).toHaveProperty('reason');
      expect(harness.studies[0]).toMatchObject({ status: 'WAITING_APPROVAL' });
    });

    it('lets the reporter pick the study up again', async () => {
      await submitReport();
      await post(`/api/v1/studies/${STUDY}/start-approval`, 'doctorA').expect(200);
      await post(`/api/v1/studies/${STUDY}/return-to-reporter`, 'doctorA', {
        reason: 'duzeltme gerekli',
      }).expect(200);

      const response = await post(
        `/api/v1/studies/${STUDY}/start-transcription`,
        'reporter',
      ).expect(200);

      // A fresh draft, so the completed version is not edited in place.
      expect(response.body.data.report.currentVersion).toMatchObject({
        versionNumber: 2,
        status: 'DRAFT',
      });
    });
  });

  describe('finalize', () => {
    async function approveAndFinalize(body?: object) {
      await submitReport();
      await post(`/api/v1/studies/${STUDY}/start-approval`, 'doctorA').expect(200);
      return post(`/api/v1/studies/${STUDY}/finalize`, 'doctorA', body);
    }

    it('finalizes the report and queues an HBYS delivery', async () => {
      const response = await approveAndFinalize();

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        studyId: STUDY,
        // Finalize does not wait for HBYS; the study lands on HBYS_PENDING.
        status: 'HBYS_PENDING',
        report: { status: 'FINAL' },
        hbysDelivery: { status: 'PENDING' },
      });
      expect(harness.studies[0]).toMatchObject({ status: 'HBYS_PENDING' });
    });

    it('records both transitions and the finalization audit', async () => {
      await approveAndFinalize();

      const transitions = harness.statusHistory.map((row) => `${row.fromStatus}->${row.toStatus}`);
      expect(transitions).toEqual(
        expect.arrayContaining(['WAITING_APPROVAL->FINAL', 'FINAL->HBYS_PENDING']),
      );
      expect(harness.auditLogs.map((row) => row.eventType)).toEqual(
        expect.arrayContaining(['REPORT_FINALIZED', 'HBYS_DELIVERY_QUEUED']),
      );
    });

    it('marks the report version FINAL with a timestamp', async () => {
      await approveAndFinalize();

      expect(harness.reportVersions[0]).toMatchObject({ status: 'FINAL' });
      expect(harness.reportVersions[0].finalizedAt).toBeInstanceOf(Date);
      expect(harness.reports[0]).toMatchObject({ status: 'FINAL' });
    });

    it('creates exactly one delivery, bound to the finalized version', async () => {
      const response = await approveAndFinalize();

      expect(harness.hbysDeliveries).toHaveLength(1);
      expect(harness.hbysDeliveries[0]).toMatchObject({
        studyId: STUDY,
        status: 'PENDING',
        reportVersionId: response.body.data.report.versionId,
        attemptCount: 0,
      });
      expect(harness.hbysDeliveries[0].idempotencyKey).toEqual(expect.any(String));
    });

    it('keeps the reporter version when the doctor edits at finalize time', async () => {
      const response = await approveAndFinalize({ content: 'Hekim final metni.' });

      expect(response.status).toBe(200);
      expect(harness.reportVersions[0]).toMatchObject({
        versionNumber: 1,
        content: REPORT_TEXT,
        // Superseded, not overwritten.
        status: 'SUPERSEDED',
      });
      expect(harness.reportVersions[1]).toMatchObject({
        versionNumber: 2,
        content: 'Hekim final metni.',
        status: 'FINAL',
        createdBy: 'u-doctor',
      });
    });

    it('refuses a second finalize', async () => {
      await approveAndFinalize();

      const response = await post(`/api/v1/studies/${STUDY}/finalize`, 'doctorA').expect(409);

      expect(response.body.error.code).toBe('INVALID_STATE_TRANSITION');
      expect(harness.hbysDeliveries).toHaveLength(1);
    });

    it('refuses an empty final report', async () => {
      await submitReport();
      await post(`/api/v1/studies/${STUDY}/start-approval`, 'doctorA').expect(200);

      const response = await post(`/api/v1/studies/${STUDY}/finalize`, 'doctorA', {
        content: '   ',
      }).expect(422);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(harness.studies[0]).toMatchObject({ status: 'WAITING_APPROVAL' });
    });

    it('refuses a doctor who does not hold the approval lock', async () => {
      await submitReport();
      await post(`/api/v1/studies/${STUDY}/start-approval`, 'doctorA').expect(200);

      const response = await post(`/api/v1/studies/${STUDY}/finalize`, 'doctorB').expect(423);
      expect(response.body.error.code).toBe('LOCK_NOT_OWNED');
    });

    it('refuses a doctor the study is not assigned to', async () => {
      await submitReport();
      // Doctor B takes the lock first, but the study is assigned to nobody yet,
      // so assign it to doctor A to make the mismatch explicit.
      harness.studies[0].assignedDoctorId = 'u-doctor';

      const response = await post(`/api/v1/studies/${STUDY}/start-approval`, 'doctorB').expect(403);

      expect(response.body.error.code).toBe('STUDY_NOT_ASSIGNED_TO_USER');
    });

    it.each(['reporter', 'operation', 'manager'])(
      'refuses a %s: clinical final approval is the doctor task',
      async (role) => {
        await submitReport();

        const response = await post(`/api/v1/studies/${STUDY}/finalize`, role, {
          content: 'x',
        }).expect(403);

        expect(response.body.error.code).toBe('FORBIDDEN');
        expect(harness.hbysDeliveries).toHaveLength(0);
      },
    );

    it('leaves the study readable in the finalized pool', async () => {
      await approveAndFinalize();

      const response = await get('/api/v1/studies?pool=FINALIZED', 'doctorA').expect(200);

      expect(response.body.data.map((item: { id: string }) => item.id)).toContain(STUDY);
    });
  });
});
