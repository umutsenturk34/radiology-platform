import { ReportSource, ReportStatus, StudyStatus, UserRole, UserStatus } from '@radiology/shared';
import { ReportsService } from './reports.service';
import { HospitalScopeService } from '../auth/hospital-scope.service';
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
