import { PATIENT_CATEGORIES, PatientCategory, SlaState, SortOrder, StudyPool, StudyStatus, UserRole, UserStatus } from '@radiology/shared'; // prettier-ignore
import { StudiesService } from './studies.service';
import { ListStudiesDto } from './dto/list-studies.dto';
import { HospitalScopeService } from '../auth/hospital-scope.service';
import { SlaService } from '../sla/sla.service';
import { AppException } from '../common/errors/app.exception';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';

const HOSPITAL_A = 'hospital-a';
const HOSPITAL_B = 'hospital-b';

function principal(role: UserRole, hospitalIds: string[], id = 'user-1'): AuthenticatedUser {
  return {
    id,
    email: 'user@test.local',
    role,
    status: UserStatus.ACTIVE,
    sessionId: 'session-1',
    hospitalIds,
  };
}

function buildQuery(overrides: Partial<ListStudiesDto> = {}): ListStudiesDto {
  return Object.assign(new ListStudiesDto(), overrides);
}

function studyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'study-1',
    hospitalId: HOSPITAL_A,
    accessionNumber: 'ACC-001',
    status: StudyStatus.UNREAD,
    category: PatientCategory.ACIL,
    modality: 'CT',
    studyDescription: 'BT Toraks',
    studyInstanceUid: null,
    externalOrderId: null,
    externalProtocolId: null,
    arrivalAt: new Date('2026-08-15T10:00:00.000Z'),
    slaDeadlineAt: new Date('2026-08-15T12:00:00.000Z'),
    firstHl7ReceivedAt: null,
    secondHl7ReceivedAt: null,
    imagesAvailableAt: null,
    readingStartedAt: null,
    readingCompletedAt: null,
    transcriptionStartedAt: null,
    transcriptionCompletedAt: null,
    finalizedAt: null,
    patient: {
      id: 'patient-1',
      externalPatientId: 'TEST-001',
      firstName: 'Test',
      lastName: 'Hasta',
      birthDate: null,
      gender: null,
    },
    hospital: { id: HOSPITAL_A, code: 'TEST_HOSPITAL', name: 'Test Hastanesi', shortName: 'TEST' },
    assignedDoctor: null,
    assignedReporter: null,
    ...overrides,
  };
}

/** Records the arguments Prisma was called with so the query can be asserted. */
function createPrismaSpy(rows: Array<Record<string, unknown>> = [studyRow()]) {
  const calls: { count?: unknown; findMany?: unknown; findUnique?: unknown } = {};

  const prisma = {
    study: {
      count: (args: unknown) => {
        calls.count = args;
        return Promise.resolve(rows.length);
      },
      findMany: (args: unknown) => {
        calls.findMany = args;
        return Promise.resolve(rows);
      },
      findUnique: (args: unknown) => {
        calls.findUnique = args;
        return Promise.resolve(rows[0] ?? null);
      },
    },
    $transaction: (operations: Array<Promise<unknown>>) => Promise.all(operations),
    // The SLA engine reads the active warning windows; the seeded 20 minutes
    // keeps these query-shape assertions on the policy the pilot actually runs.
    slaPolicy: {
      findMany: () =>
        Promise.resolve(
          PATIENT_CATEGORIES.map((category) => ({ category, warningBeforeMinutes: 20 })),
        ),
    },
  };

  return { prisma: prisma as unknown as PrismaService, calls };
}

function createService(rows?: Array<Record<string, unknown>>) {
  const { prisma, calls } = createPrismaSpy(rows);
  return {
    service: new StudiesService(prisma, new HospitalScopeService(), new SlaService(prisma)),
    calls,
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

type WhereClause = Record<string, unknown>;
const whereOf = (args: unknown): WhereClause => (args as { where: WhereClause }).where;

describe('StudiesService.list', () => {
  it('restricts a scoped user to the hospitals they may see', async () => {
    const { service, calls } = createService();

    await service.list(principal(UserRole.DOCTOR, [HOSPITAL_A, HOSPITAL_B]), buildQuery());

    expect(whereOf(calls.findMany)).toMatchObject({
      hospitalId: { in: [HOSPITAL_A, HOSPITAL_B] },
    });
    // The count must carry the same restriction, or pagination would advertise
    // studies the user cannot see.
    expect(whereOf(calls.count)).toEqual(whereOf(calls.findMany));
  });

  it('leaves a Manager query unrestricted', async () => {
    const { service, calls } = createService();

    await service.list(principal(UserRole.MANAGER, []), buildQuery());

    expect(whereOf(calls.findMany)).not.toHaveProperty('hospitalId');
  });

  it('returns nothing for a user with no hospital access', async () => {
    const { service, calls } = createService();

    await service.list(principal(UserRole.REPORTER, []), buildQuery());

    expect(whereOf(calls.findMany)).toMatchObject({ hospitalId: { in: [] } });
  });

  it('refuses a hospitalId filter outside the caller scope', async () => {
    const { service } = createService();

    await expectAppError(
      service.list(principal(UserRole.DOCTOR, [HOSPITAL_A]), buildQuery({ hospitalId: HOSPITAL_B })),
      'HOSPITAL_ACCESS_DENIED',
    );
  });

  it('narrows to an authorized hospitalId filter', async () => {
    const { service, calls } = createService();

    await service.list(
      principal(UserRole.DOCTOR, [HOSPITAL_A, HOSPITAL_B]),
      buildQuery({ hospitalId: HOSPITAL_B }),
    );

    expect(whereOf(calls.findMany)).toMatchObject({ hospitalId: HOSPITAL_B });
  });

  it('defaults to arrivalAt ascending so FIFO is the natural order', async () => {
    const { service, calls } = createService();

    await service.list(principal(UserRole.DOCTOR, [HOSPITAL_A]), buildQuery());

    expect((calls.findMany as { orderBy: unknown }).orderBy).toEqual([
      { arrivalAt: 'asc' },
      { id: 'asc' },
    ]);
  });

  it('honours an explicit sort', async () => {
    const { service, calls } = createService();

    await service.list(
      principal(UserRole.DOCTOR, [HOSPITAL_A]),
      buildQuery({ sortBy: 'slaDeadlineAt', sortOrder: SortOrder.DESC }),
    );

    expect((calls.findMany as { orderBy: unknown }).orderBy).toEqual([
      { slaDeadlineAt: 'desc' },
      { id: 'asc' },
    ]);
  });

  it('paginates with the documented defaults', async () => {
    const { service, calls } = createService();

    const result = await service.list(principal(UserRole.DOCTOR, [HOSPITAL_A]), buildQuery());

    expect(calls.findMany).toMatchObject({ skip: 0, take: 25 });
    expect(result.meta).toEqual({ page: 1, pageSize: 25, total: 1, totalPages: 1 });
  });

  it('computes the offset for a later page', async () => {
    const { service, calls } = createService();

    await service.list(
      principal(UserRole.DOCTOR, [HOSPITAL_A]),
      buildQuery({ page: 3, pageSize: 10 }),
    );

    expect(calls.findMany).toMatchObject({ skip: 20, take: 10 });
  });

  it('filters by status and category', async () => {
    const { service, calls } = createService();

    await service.list(
      principal(UserRole.DOCTOR, [HOSPITAL_A]),
      buildQuery({ status: StudyStatus.READING, category: PatientCategory.YATAN }),
    );

    expect(whereOf(calls.findMany)).toMatchObject({
      status: StudyStatus.READING,
      category: PatientCategory.YATAN,
    });
  });

  it.each([
    [StudyPool.UNREAD, StudyStatus.UNREAD],
    [StudyPool.WAITING_TRANSCRIPTION, StudyStatus.WAITING_TRANSCRIPTION],
    [StudyPool.WAITING_APPROVAL, StudyStatus.WAITING_APPROVAL],
    [StudyPool.HBYS_FAILED, StudyStatus.HBYS_FAILED],
    [StudyPool.IMAGE_MISSING, StudyStatus.IMAGE_MISSING],
  ])('maps the %s pool to a single status', async (pool, status) => {
    const { service, calls } = createService();

    await service.list(principal(UserRole.OPERATION, [HOSPITAL_A]), buildQuery({ pool }));

    expect(whereOf(calls.findMany)).toMatchObject({ status });
  });

  it('maps the FINALIZED pool to every post-approval status', async () => {
    const { service, calls } = createService();

    await service.list(
      principal(UserRole.OPERATION, [HOSPITAL_A]),
      buildQuery({ pool: StudyPool.FINALIZED }),
    );

    // An HBYS failure does not make a study clinically unread again (TS-053).
    expect(whereOf(calls.findMany)).toMatchObject({
      status: {
        in: [
          StudyStatus.FINAL,
          StudyStatus.HBYS_PENDING,
          StudyStatus.HBYS_SENT,
          StudyStatus.HBYS_FAILED,
        ],
      },
    });
  });

  it('lets an explicit status win over a pool preset', async () => {
    const { service, calls } = createService();

    await service.list(
      principal(UserRole.OPERATION, [HOSPITAL_A]),
      buildQuery({ pool: StudyPool.UNREAD, status: StudyStatus.READING }),
    );

    expect(whereOf(calls.findMany)).toMatchObject({ status: StudyStatus.READING });
  });

  it('resolves the "me" assignee alias to the caller', async () => {
    const { service, calls } = createService();

    await service.list(
      principal(UserRole.DOCTOR, [HOSPITAL_A], 'user-doctor'),
      buildQuery({ assignedDoctorId: 'me' }),
    );

    expect(whereOf(calls.findMany)).toMatchObject({ assignedDoctorId: 'user-doctor' });
  });

  it('keeps an explicit assignee id', async () => {
    const { service, calls } = createService();

    await service.list(
      principal(UserRole.OPERATION, [HOSPITAL_A]),
      buildQuery({ assignedReporterId: 'user-reporter' }),
    );

    expect(whereOf(calls.findMany)).toMatchObject({ assignedReporterId: 'user-reporter' });
  });

  it('searches accession, description and patient fields without dropping the hospital scope', async () => {
    const { service, calls } = createService();

    await service.list(
      principal(UserRole.DOCTOR, [HOSPITAL_A]),
      buildQuery({ search: 'ACC-001' }),
    );

    const where = whereOf(calls.findMany);
    expect(where).toMatchObject({ hospitalId: { in: [HOSPITAL_A] } });
    expect(where.OR).toEqual([
      { accessionNumber: { contains: 'ACC-001', mode: 'insensitive' } },
      { studyDescription: { contains: 'ACC-001', mode: 'insensitive' } },
      { patient: { firstName: { contains: 'ACC-001', mode: 'insensitive' } } },
      { patient: { lastName: { contains: 'ACC-001', mode: 'insensitive' } } },
      { patient: { externalPatientId: { contains: 'ACC-001', mode: 'insensitive' } } },
    ]);
  });

  it('maps rows to the list contract without leaking persistence fields', async () => {
    const { service } = createService();

    const result = await service.list(principal(UserRole.DOCTOR, [HOSPITAL_A]), buildQuery());

    expect(result.data[0]).toEqual({
      id: 'study-1',
      accessionNumber: 'ACC-001',
      patient: { id: 'patient-1', displayName: 'Test Hasta', externalPatientId: 'TEST-001' },
      hospital: { id: HOSPITAL_A, code: 'TEST_HOSPITAL', shortName: 'TEST' },
      studyDescription: 'BT Toraks',
      modality: 'CT',
      category: PatientCategory.ACIL,
      status: StudyStatus.UNREAD,
      arrivalAt: '2026-08-15T10:00:00.000Z',
      // The fixture deadline is permanently in the past, so the state is
      // stable; only how far past it is moves with the clock, and the SLA
      // arithmetic itself is asserted in sla.calculator.spec.ts.
      sla: {
        deadlineAt: '2026-08-15T12:00:00.000Z',
        completedAt: null,
        remainingSeconds: 0,
        overdueSeconds: expect.any(Number),
        state: SlaState.OVERDUE,
      },
      assignment: { doctor: null, reporter: null },
    });
    expect(result.data[0]).not.toHaveProperty('hospitalId');
    expect(result.data[0]).not.toHaveProperty('patientId');
  });
});

describe('StudiesService.getById', () => {
  it('returns the detail for a study in an authorized hospital', async () => {
    const { service } = createService();

    const detail = await service.getById(
      principal(UserRole.DOCTOR, [HOSPITAL_A]),
      'study-1',
    );

    expect(detail).toMatchObject({
      id: 'study-1',
      accessionNumber: 'ACC-001',
      hospital: { id: HOSPITAL_A, code: 'TEST_HOSPITAL', name: 'Test Hastanesi' },
      patient: { displayName: 'Test Hasta' },
      study: { description: 'BT Toraks', modality: 'CT' },
    });
    expect(detail).not.toHaveProperty('hospitalId');
  });

  it('refuses a study belonging to another hospital, even with the right UUID', async () => {
    const { service } = createService([studyRow({ hospitalId: HOSPITAL_B })]);

    const error = await expectAppError(
      service.getById(principal(UserRole.DOCTOR, [HOSPITAL_A]), 'study-1'),
      'HOSPITAL_ACCESS_DENIED',
    );

    expect(error.getStatus()).toBe(403);
  });

  it('lets a Manager read any hospital', async () => {
    const { service } = createService([studyRow({ hospitalId: HOSPITAL_B })]);

    await expect(
      service.getById(principal(UserRole.MANAGER, []), 'study-1'),
    ).resolves.toMatchObject({ id: 'study-1' });
  });

  it('returns NOT_FOUND for a study that does not exist', async () => {
    const { service } = createService([]);

    await expectAppError(
      service.getById(principal(UserRole.DOCTOR, [HOSPITAL_A]), 'study-missing'),
      'NOT_FOUND',
    );
  });
});
