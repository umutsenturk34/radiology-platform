import { ReportSource, ReportStatus, StudyStatus, UserRole, UserStatus } from '@radiology/shared';
import { ReportsService } from './reports.service';
import { HospitalScopeService } from '../auth/hospital-scope.service';
import { StudyLockedException } from '../locks/study-lock.service';
import { AppException } from '../common/errors/app.exception';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';

const HOSPITAL_A = 'hospital-a';
const HOSPITAL_B = 'hospital-b';
const STUDY_ID = 'study-1';
const REPORT_ID = 'report-1';

function principal(role: UserRole, hospitalIds: string[]): AuthenticatedUser {
  return {
    id: 'user-1',
    email: 'user@test.local',
    role,
    status: UserStatus.ACTIVE,
    sessionId: 'session-1',
    hospitalIds,
  };
}

interface VersionSeed {
  id: string;
  versionNumber: number;
  content?: string;
  status?: ReportStatus;
  completedAt?: Date | null;
  finalizedAt?: Date | null;
}

function version(seed: VersionSeed) {
  return {
    id: seed.id,
    reportId: REPORT_ID,
    versionNumber: seed.versionNumber,
    content: seed.content ?? `metin ${seed.versionNumber}`,
    source: ReportSource.REPORTER,
    status: seed.status ?? ReportStatus.DRAFT,
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
    completedAt: seed.completedAt ?? null,
    finalizedAt: seed.finalizedAt ?? null,
    author: { id: 'user-1', firstName: 'Test', lastName: 'Reporter' },
  };
}

/**
 * Applies the ordering the service asks Prisma for, so the assertions below are
 * about the service's contract rather than about a stub that returns rows in
 * whatever order they were written.
 */
function createService(options: { versions?: ReturnType<typeof version>[]; report?: boolean; study?: boolean } = {}) {
  const { versions = [], report = true, study = true } = options;
  const queries: { orderBy?: unknown } = {};

  const prisma = {
    study: {
      findUnique: () =>
        Promise.resolve(
          study
            ? { id: STUDY_ID, hospitalId: HOSPITAL_A, patientId: 'patient-1', status: StudyStatus.TRANSCRIBING, assignedDoctorId: null } // prettier-ignore
            : null,
        ),
    },
    report: {
      findUnique: () => Promise.resolve(report ? { id: REPORT_ID } : null),
    },
    reportVersion: {
      findMany: ({ orderBy }: { orderBy?: Record<string, 'asc' | 'desc'> }) => {
        queries.orderBy = orderBy;
        const [field, direction] = Object.entries(orderBy ?? {})[0] ?? ['versionNumber', 'asc'];
        return Promise.resolve(
          [...versions].sort((a, b) => {
            const left = Number((a as unknown as Record<string, unknown>)[field] ?? 0);
            const right = Number((b as unknown as Record<string, unknown>)[field] ?? 0);
            return direction === 'desc' ? right - left : left - right;
          }),
        );
      },
    },
  } as unknown as PrismaService;

  const service = new ReportsService(
    prisma,
    {} as never,
    {} as never,
    new HospitalScopeService(),
    {} as never,
    {} as never,
    { child: () => ({ info: () => undefined, warn: () => undefined, error: () => undefined }) } as never,
  );

  return { service, queries };
}

async function expectAppError(promise: Promise<unknown>, code: string): Promise<AppException> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).code).toBe(code);
    return error as AppException;
  }
  throw new Error(`expected ${code} but the call resolved`);
}

describe('ReportsService.listVersions', () => {
  it('returns the whole history, oldest version first', async () => {
    const { service } = createService({
      versions: [
        version({ id: 'v2', versionNumber: 2 }),
        version({ id: 'v1', versionNumber: 1, status: ReportStatus.SUPERSEDED }),
        version({ id: 'v3', versionNumber: 3 }),
      ],
    });

    const result = await service.listVersions(principal(UserRole.REPORTER, [HOSPITAL_A]), STUDY_ID);

    expect(result.map((v) => v.versionNumber)).toEqual([1, 2, 3]);
  });

  it('asks the database for that order rather than sorting in memory', async () => {
    const { service, queries } = createService({ versions: [version({ id: 'v1', versionNumber: 1 })] });

    await service.listVersions(principal(UserRole.DOCTOR, [HOSPITAL_A]), STUDY_ID);

    // versionNumber is unique per report, so this sort is total — two calls
    // cannot disagree the way a createdAt sort can on equal timestamps.
    expect(queries.orderBy).toEqual({ versionNumber: 'asc' });
  });

  it('maps a version to the shared contract without leaking persistence fields', async () => {
    const { service } = createService({
      versions: [
        version({
          id: 'v1',
          versionNumber: 1,
          content: 'Bulgular',
          status: ReportStatus.FINAL,
          completedAt: new Date('2026-09-01T11:00:00.000Z'),
          finalizedAt: new Date('2026-09-01T12:00:00.000Z'),
        }),
      ],
    });

    const [dto] = await service.listVersions(principal(UserRole.MANAGER, []), STUDY_ID);

    expect(dto).toEqual({
      id: 'v1',
      versionNumber: 1,
      content: 'Bulgular',
      source: ReportSource.REPORTER,
      status: ReportStatus.FINAL,
      createdBy: { id: 'user-1', displayName: 'Test Reporter' },
      createdAt: '2026-09-01T10:00:00.000Z',
      completedAt: '2026-09-01T11:00:00.000Z',
      finalizedAt: '2026-09-01T12:00:00.000Z',
    });
    expect(dto).not.toHaveProperty('reportId');
    expect(dto).not.toHaveProperty('supersedesVersionId');
  });

  it('returns an empty list for a report that somehow has no versions', async () => {
    const { service } = createService({ versions: [] });

    await expect(
      service.listVersions(principal(UserRole.OPERATION, [HOSPITAL_A]), STUDY_ID),
    ).resolves.toEqual([]);
  });

  it('is NOT_FOUND when the study does not exist', async () => {
    const { service } = createService({ study: false });

    await expectAppError(
      service.listVersions(principal(UserRole.DOCTOR, [HOSPITAL_A]), STUDY_ID),
      'NOT_FOUND',
    );
  });

  it('is NOT_FOUND when the study has no report yet', async () => {
    const { service } = createService({ report: false });

    await expectAppError(
      service.listVersions(principal(UserRole.DOCTOR, [HOSPITAL_A]), STUDY_ID),
      'NOT_FOUND',
    );
  });

  it('refuses a study outside the caller hospital scope before reading any version', async () => {
    const { service, queries } = createService({ versions: [version({ id: 'v1', versionNumber: 1 })] });

    const error = await expectAppError(
      service.listVersions(principal(UserRole.REPORTER, [HOSPITAL_B]), STUDY_ID),
      'HOSPITAL_ACCESS_DENIED',
    );

    expect(error.getStatus()).toBe(403);
    // Nothing was queried: scope is checked before the history is touched.
    expect(queries.orderBy).toBeUndefined();
  });

  it.each([UserRole.DOCTOR, UserRole.REPORTER, UserRole.OPERATION])(
    'lets %s read the history of a study in scope (AUTH_ROLES_PERMISSIONS section 91)',
    async (role) => {
      const { service } = createService({ versions: [version({ id: 'v1', versionNumber: 1 })] });

      await expect(
        service.listVersions(principal(role, [HOSPITAL_A]), STUDY_ID),
      ).resolves.toHaveLength(1);
    },
  );
});


/**
 * `resumeTranscription` guards that are hard to reach over HTTP.
 *
 * A foreign lock on a TRANSCRIBING study has no legitimate path today, so the
 * 423 branch is defensive; stubbing the lock service is the honest way to
 * prove it is wired rather than staging a scenario the workflow cannot produce.
 */
function createResumeService(options: {
  status?: StudyStatus;
  assignedReporterId?: string | null;
  assignment?: boolean;
  lockedByOther?: boolean;
} = {}) {
  const {
    status = StudyStatus.TRANSCRIBING,
    assignedReporterId = 'user-1',
    assignment = true,
    lockedByOther = false,
  } = options;

  const acquired: string[] = [];

  const prisma = {
    study: {
      findUnique: () =>
        Promise.resolve({
          id: STUDY_ID,
          hospitalId: HOSPITAL_A,
          patientId: 'patient-1',
          status,
          assignedDoctorId: null,
          assignedReporterId,
        }),
    },
    studyAssignment: {
      findFirst: () => Promise.resolve(assignment ? { id: 'assignment-1' } : null),
    },
    user: { findUnique: () => Promise.resolve({ firstName: 'Test', lastName: 'Reporter' }) },
    report: {
      findUnique: () =>
        Promise.resolve({
          id: REPORT_ID,
          studyId: STUDY_ID,
          status: ReportStatus.DRAFT,
          finalizedAt: null,
          currentVersion: version({ id: 'v1', versionNumber: 1 }),
        }),
    },
  } as unknown as PrismaService;

  const locks = {
    heartbeatSeconds: 20,
    acquire: (studyId: string) => {
      if (lockedByOther) {
        throw new StudyLockedException({
          studyId,
          ownerUserId: 'someone-else',
          ownerDisplayName: 'Baska Kullanici',
          ownerRole: UserRole.REPORTER,
          lockedAt: new Date().toISOString(),
        });
      }
      acquired.push(studyId);
      return Promise.resolve({
        lock: {
          studyId,
          ownerUserId: 'user-1',
          ownerDisplayName: 'Test Reporter',
          ownerRole: UserRole.REPORTER,
          lockedAt: '2026-09-02T10:00:00.000Z',
        },
        alreadyOwned: false,
      });
    },
  };

  const audited: string[] = [];
  const emitted: string[] = [];

  const service = new ReportsService(
    prisma,
    {} as never,
    locks as never,
    new HospitalScopeService(),
    { record: (entry: { eventType: string }) => { audited.push(entry.eventType); return Promise.resolve(); } } as never, // prettier-ignore
    { emitStudyLocked: () => emitted.push('study.locked') } as never,
    { child: () => ({ info: () => undefined, warn: () => undefined, error: () => undefined }) } as never, // prettier-ignore
  );

  return { service, acquired, audited, emitted };
}

describe('ReportsService.resumeTranscription', () => {
  const reporter = principal(UserRole.REPORTER, [HOSPITAL_A]);

  it('takes the lock, audits and announces it', async () => {
    const { service, acquired, audited, emitted } = createResumeService();

    const result = await service.resumeTranscription(reporter, STUDY_ID);

    expect(result).toMatchObject({
      studyId: STUDY_ID,
      status: StudyStatus.TRANSCRIBING,
      lock: { ownerUserId: 'user-1', ownerRole: UserRole.REPORTER, heartbeatIntervalSeconds: 20 },
    });
    expect(acquired).toEqual([STUDY_ID]);
    expect(audited).toEqual(['TRANSCRIPTION_RESUMED']);
    expect(emitted).toEqual(['study.locked']);
  });

  it('propagates STUDY_LOCKED rather than taking a lock someone else holds', async () => {
    const { service } = createResumeService({ lockedByOther: true });

    const error = await expectAppError(
      service.resumeTranscription(reporter, STUDY_ID),
      'STUDY_LOCKED',
    );

    expect(error.getStatus()).toBe(423);
    expect(error.details).toMatchObject({ ownerUserId: 'someone-else' });
  });

  it.each([
    StudyStatus.WAITING_TRANSCRIPTION,
    StudyStatus.WAITING_APPROVAL,
    StudyStatus.UNREAD,
    StudyStatus.FINAL,
  ])('refuses a study in %s without touching the lock', async (status) => {
    const { service, acquired } = createResumeService({ status });

    await expectAppError(
      service.resumeTranscription(reporter, STUDY_ID),
      'INVALID_STATE_TRANSITION',
    );
    expect(acquired).toEqual([]);
  });

  it('refuses a reporter the study is not assigned to, before acquiring', async () => {
    const { service, acquired, audited } = createResumeService({ assignedReporterId: 'other-user' });

    await expectAppError(
      service.resumeTranscription(reporter, STUDY_ID),
      'STUDY_NOT_ASSIGNED_TO_USER',
    );
    expect(acquired).toEqual([]);
    expect(audited).toEqual([]);
  });

  it('refuses when the assignment has already been released', async () => {
    // The study row may still carry the id while the assignment row is closed;
    // the closed assignment is what decides (WORKFLOW_STATE_MACHINE 74).
    const { service, acquired } = createResumeService({ assignment: false });

    await expectAppError(
      service.resumeTranscription(reporter, STUDY_ID),
      'STUDY_NOT_ASSIGNED_TO_USER',
    );
    expect(acquired).toEqual([]);
  });

  it('refuses a study outside the caller hospital scope', async () => {
    const { service, acquired } = createResumeService();

    await expectAppError(
      service.resumeTranscription(principal(UserRole.REPORTER, [HOSPITAL_B]), STUDY_ID),
      'HOSPITAL_ACCESS_DENIED',
    );
    expect(acquired).toEqual([]);
  });
});
