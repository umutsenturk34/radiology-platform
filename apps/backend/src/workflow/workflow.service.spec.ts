import { StudyStatus, UserRole } from '@radiology/shared';
import { WorkflowService } from './workflow.service';
import { ALLOWED_TRANSITIONS, isTransitionAllowed } from './workflow.transitions';
import { AppLogger } from '../common/logging/app-logger.service';
import { AppException } from '../common/errors/app.exception';
import type { AuditService } from '../audit/audit.service';
import type { PrismaService } from '../prisma/prisma.service';

interface StoredStudy {
  id: string;
  status: string;
  hospitalId: string;
  patientId: string;
  [key: string]: unknown;
}

/** In-memory stand-in for the three tables a transition writes. */
function createFakePrisma(studies: StoredStudy[]) {
  const history: Array<Record<string, unknown>> = [];
  const audit: Array<Record<string, unknown>> = [];

  const client = {
    study: {
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(studies.find((study) => study.id === where.id) ?? null),
      update: ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const study = studies.find((candidate) => candidate.id === where.id);
        if (!study) throw new Error('study not found');
        Object.assign(study, data);
        return Promise.resolve(study);
      },
    },
    studyStatusHistory: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        history.push(data);
        return Promise.resolve(data);
      },
    },
    auditLog: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        audit.push(data);
        return Promise.resolve(data);
      },
    },
  };

  const prisma = {
    ...client,
    $transaction: (callback: (tx: unknown) => Promise<unknown>) => callback(client),
  };

  return { prisma: prisma as unknown as PrismaService, client, history, audit };
}

function createService(studies: StoredStudy[]) {
  const fake = createFakePrisma(studies);
  const auditRows: Array<Record<string, unknown>> = [];

  const auditService = {
    record: (entry: Record<string, unknown>) => {
      auditRows.push(entry);
      return Promise.resolve();
    },
  } as unknown as AuditService;

  return {
    service: new WorkflowService(fake.prisma, auditService, new AppLogger('error')),
    studies,
    history: fake.history,
    auditRows,
  };
}

function study(overrides: Partial<StoredStudy> = {}): StoredStudy {
  return {
    id: 'study-1',
    status: StudyStatus.UNREAD,
    hospitalId: 'hospital-1',
    patientId: 'patient-1',
    ...overrides,
  };
}

async function expectAppError(promise: Promise<unknown>, code: string): Promise<AppException> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).code).toBe(code);
    return error as AppException;
  }
  throw new Error(`Expected the call to reject with ${code}`);
}

describe('transition table', () => {
  it.each([
    [StudyStatus.INITIAL, StudyStatus.WAITING_ACCEPTANCE],
    [StudyStatus.WAITING_ACCEPTANCE, StudyStatus.IMAGES_PENDING],
    [StudyStatus.IMAGES_PENDING, StudyStatus.UNREAD],
    [StudyStatus.UNREAD, StudyStatus.READING],
    [StudyStatus.READING, StudyStatus.READ],
    [StudyStatus.READ, StudyStatus.WAITING_TRANSCRIPTION],
    [StudyStatus.WAITING_TRANSCRIPTION, StudyStatus.TRANSCRIBING],
    [StudyStatus.TRANSCRIBING, StudyStatus.WAITING_APPROVAL],
    [StudyStatus.WAITING_APPROVAL, StudyStatus.FINAL],
    [StudyStatus.FINAL, StudyStatus.HBYS_PENDING],
    [StudyStatus.HBYS_PENDING, StudyStatus.HBYS_SENT],
    [StudyStatus.HBYS_PENDING, StudyStatus.HBYS_FAILED],
    [StudyStatus.HBYS_FAILED, StudyStatus.HBYS_PENDING],
    [StudyStatus.READING, StudyStatus.IMAGE_MISSING],
    [StudyStatus.IMAGE_MISSING, StudyStatus.UNREAD],
    [StudyStatus.UNREAD, StudyStatus.WONT_REPORT],
    [StudyStatus.WONT_REPORT, StudyStatus.UNREAD],
    [StudyStatus.UNREAD, StudyStatus.HOSPITAL_DOCTOR],
    [StudyStatus.HOSPITAL_DOCTOR, StudyStatus.UNREAD],
    [StudyStatus.HBYS_SENT, StudyStatus.REVISION_REQUESTED],
    [StudyStatus.REVISION_REQUESTED, StudyStatus.REVISION_IN_PROGRESS],
    // Approval may send the report back (WORKFLOW_STATE_MACHINE section 57).
    [StudyStatus.WAITING_APPROVAL, StudyStatus.WAITING_TRANSCRIPTION],
  ])('allows %s -> %s', (from, to) => {
    expect(isTransitionAllowed(from, to)).toBe(true);
  });

  it.each([
    [StudyStatus.UNREAD, StudyStatus.FINAL],
    [StudyStatus.INITIAL, StudyStatus.UNREAD],
    [StudyStatus.WAITING_ACCEPTANCE, StudyStatus.READING],
    [StudyStatus.IMAGES_PENDING, StudyStatus.READING],
    [StudyStatus.READING, StudyStatus.WAITING_APPROVAL],
    [StudyStatus.TRANSCRIBING, StudyStatus.FINAL],
    [StudyStatus.WAITING_TRANSCRIPTION, StudyStatus.WAITING_APPROVAL],
    [StudyStatus.HBYS_SENT, StudyStatus.HBYS_PENDING],
    [StudyStatus.FINAL, StudyStatus.WAITING_APPROVAL],
    [StudyStatus.UNREAD, StudyStatus.UNREAD],
  ])('refuses %s -> %s', (from, to) => {
    expect(isTransitionAllowed(from, to)).toBe(false);
  });

  it('covers every status, so no state is silently unreachable in the table', () => {
    for (const status of Object.values(StudyStatus)) {
      expect(ALLOWED_TRANSITIONS[status]).toBeDefined();
    }
  });
});

describe('WorkflowService.transition', () => {
  it('moves the study and records history and audit', async () => {
    const { service, studies, history, auditRows } = createService([study()]);

    const result = await service.transition('study-1', StudyStatus.READING, {
      actorUserId: 'user-doctor',
      actorRole: UserRole.DOCTOR,
    });

    expect(result).toEqual({
      studyId: 'study-1',
      fromStatus: StudyStatus.UNREAD,
      toStatus: StudyStatus.READING,
      // Returned so the caller can address the realtime event after its
      // transaction commits without re-reading the study.
      hospitalId: 'hospital-1',
    });
    expect(studies[0].status).toBe(StudyStatus.READING);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      studyId: 'study-1',
      fromStatus: StudyStatus.UNREAD,
      toStatus: StudyStatus.READING,
      actorUserId: 'user-doctor',
      actorRole: UserRole.DOCTOR,
    });
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({
      eventType: 'STUDY_STATUS_CHANGED',
      studyId: 'study-1',
      metadata: { fromStatus: StudyStatus.UNREAD, toStatus: StudyStatus.READING },
    });
  });

  it('refuses an invalid transition with the documented error shape', async () => {
    const { service, studies, history, auditRows } = createService([study()]);

    const error = await expectAppError(
      service.transition('study-1', StudyStatus.FINAL),
      'INVALID_STATE_TRANSITION',
    );

    expect(error.getStatus()).toBe(409);
    expect(error.details).toEqual({
      currentStatus: StudyStatus.UNREAD,
      requestedStatus: StudyStatus.FINAL,
    });
    // Nothing was written.
    expect(studies[0].status).toBe(StudyStatus.UNREAD);
    expect(history).toHaveLength(0);
    expect(auditRows).toHaveLength(0);
  });

  it('refuses a transition on a study that does not exist', async () => {
    const { service } = createService([]);

    await expectAppError(service.transition('missing', StudyStatus.READING), 'NOT_FOUND');
  });

  it('stamps the workflow timestamp for the target status', async () => {
    const { service, studies } = createService([study()]);

    await service.transition('study-1', StudyStatus.READING);

    expect(studies[0].readingStartedAt).toBeInstanceOf(Date);
  });

  it('does not stamp an images-available time when UNREAD is reached from WONT_REPORT', async () => {
    // Reaching UNREAD does not mean images arrived (they may never have left).
    const { service, studies } = createService([study({ status: StudyStatus.WONT_REPORT })]);

    await service.transition('study-1', StudyStatus.UNREAD);

    expect(studies[0].imagesAvailableAt).toBeUndefined();
  });

  it('writes caller supplied study columns in the same update', async () => {
    const { service, studies } = createService([study()]);

    await service.transition('study-1', StudyStatus.READING, {
      studyData: { assignedDoctorId: 'user-doctor' },
    });

    expect(studies[0]).toMatchObject({
      status: StudyStatus.READING,
      assignedDoctorId: 'user-doctor',
    });
  });

  it('cannot be used to overwrite the status through studyData', async () => {
    const { service, studies } = createService([study()]);

    await service.transition('study-1', StudyStatus.READING, {
      studyData: { status: StudyStatus.FINAL },
    });

    // The validated target wins over anything the caller passed.
    expect(studies[0].status).toBe(StudyStatus.READING);
  });

  it('keeps the reason on both the history row and the audit entry', async () => {
    const { service, history, auditRows } = createService([study({ status: StudyStatus.READING })]);

    await service.transition('study-1', StudyStatus.IMAGE_MISSING, {
      actorUserId: 'user-doctor',
      actorRole: UserRole.DOCTOR,
      reason: 'Seriler eksik',
    });

    expect(history[0]).toMatchObject({ reason: 'Seriler eksik' });
    expect(auditRows[0]).toMatchObject({ metadata: { reason: 'Seriler eksik' } });
  });

  it('records a system transition with no actor', async () => {
    const { service, history } = createService([study({ status: StudyStatus.INITIAL })]);

    await service.transition('study-1', StudyStatus.WAITING_ACCEPTANCE);

    expect(history[0]).toMatchObject({ actorUserId: undefined, actorRole: undefined });
  });

  it('walks the full pilot happy path', async () => {
    const { service, studies, history } = createService([study({ status: StudyStatus.INITIAL })]);

    const path = [
      StudyStatus.WAITING_ACCEPTANCE,
      StudyStatus.IMAGES_PENDING,
      StudyStatus.UNREAD,
      StudyStatus.READING,
      StudyStatus.READ,
      StudyStatus.WAITING_TRANSCRIPTION,
      StudyStatus.TRANSCRIBING,
      StudyStatus.WAITING_APPROVAL,
      StudyStatus.FINAL,
      StudyStatus.HBYS_PENDING,
      StudyStatus.HBYS_SENT,
    ];

    for (const target of path) {
      await service.transition('study-1', target);
    }

    expect(studies[0].status).toBe(StudyStatus.HBYS_SENT);
    expect(history).toHaveLength(path.length);
  });

  it('walks the HBYS failure and manual retry path', async () => {
    const { service, studies } = createService([study({ status: StudyStatus.HBYS_PENDING })]);

    await service.transition('study-1', StudyStatus.HBYS_FAILED);
    await service.transition('study-1', StudyStatus.HBYS_PENDING, { reason: 'manual retry' });
    await service.transition('study-1', StudyStatus.HBYS_SENT);

    expect(studies[0].status).toBe(StudyStatus.HBYS_SENT);
  });
});
