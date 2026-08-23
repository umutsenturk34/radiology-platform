import { Injectable } from '@nestjs/common';
import {
  ASSIGNED_TO_ME,
  buildPaginationMeta,
  SlaState,
  StudyPool,
  StudyStatus,
  type PaginatedResponse,
  type StudyDetail,
  type StudyListItem,
} from '@radiology/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SlaService, type SlaWarningWindows } from '../sla/sla.service';
import { HospitalScopeService } from '../auth/hospital-scope.service';
import { NotFoundAppException } from '../common/errors/app.exception';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ListStudiesDto } from './dto/list-studies.dto';
import { STUDY_INCLUDE, toStudyDetail, toStudyListItem, type StudyRow } from './studies.mapper';

/**
 * Operational list presets -> real statuses (docs/API_CONTRACT.md section 25).
 *
 * `FINALIZED` covers everything after the doctor's final approval: the pilot
 * treats final approval as clinical completion, and an HBYS failure does not
 * make a study clinically unread again (docs/TEST_SCENARIOS.md TS-053).
 */
const POOL_STATUSES: Record<StudyPool, StudyStatus[]> = {
  [StudyPool.UNREAD]: [StudyStatus.UNREAD],
  [StudyPool.READ]: [StudyStatus.READ],
  [StudyPool.WAITING_TRANSCRIPTION]: [StudyStatus.WAITING_TRANSCRIPTION],
  [StudyPool.WAITING_APPROVAL]: [StudyStatus.WAITING_APPROVAL],
  [StudyPool.FINALIZED]: [
    StudyStatus.FINAL,
    StudyStatus.HBYS_PENDING,
    StudyStatus.HBYS_SENT,
    StudyStatus.HBYS_FAILED,
  ],
  [StudyPool.HBYS_FAILED]: [StudyStatus.HBYS_FAILED],
  [StudyPool.IMAGE_MISSING]: [StudyStatus.IMAGE_MISSING],
  [StudyPool.WONT_REPORT]: [StudyStatus.WONT_REPORT],
  [StudyPool.HOSPITAL_DOCTOR]: [StudyStatus.HOSPITAL_DOCTOR],
};

/**
 * Study reads (TASK_QUEUE BACKEND-009).
 *
 * Every query starts from the caller's hospital scope, so an out-of-scope study
 * is invisible in lists and unreachable by id — knowing the UUID grants nothing
 * (docs/API_CONTRACT.md section 29).
 */
@Injectable()
export class StudiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hospitalScope: HospitalScopeService,
    private readonly sla: SlaService,
  ) {}

  async list(
    user: AuthenticatedUser,
    query: ListStudiesDto,
  ): Promise<PaginatedResponse<StudyListItem>> {
    // One clock for the whole page, so two studies with the same deadline can
    // never disagree about how much time is left.
    const now = new Date();
    const windows = await this.sla.warningWindows();

    // Throws HOSPITAL_ACCESS_DENIED when hospitalId names a hospital the user
    // cannot see; otherwise narrows the query to the authorized set.
    const where: Record<string, unknown> = {
      ...this.hospitalScope.buildFilter(user, query.hospitalId),
    };

    if (query.status) {
      where.status = query.status;
    } else if (query.pool) {
      const statuses = POOL_STATUSES[query.pool];
      where.status = statuses.length === 1 ? statuses[0] : { in: statuses };
    }

    if (query.category) where.category = query.category;

    const assignedDoctorId = resolveAssignee(query.assignedDoctorId, user);
    if (assignedDoctorId) where.assignedDoctorId = assignedDoctorId;

    const assignedReporterId = resolveAssignee(query.assignedReporterId, user);
    if (assignedReporterId) where.assignedReporterId = assignedReporterId;

    if (query.search) {
      Object.assign(where, buildSearchFilter(query.search));
    }

    if (query.slaState) {
      // Nested under AND because the free-text search already owns the
      // top-level OR; assigning another one would silently drop the search.
      where.AND = [buildSlaFilter(query.slaState, windows, now)];
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.study.count({ where }),
      this.prisma.study.findMany({
        where,
        include: STUDY_INCLUDE,
        orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return {
      data: (rows as unknown as StudyRow[]).map((row) =>
        toStudyListItem(row, this.sla.snapshot(row, windows, now)),
      ),
      meta: buildPaginationMeta(query.page, query.pageSize, total),
    };
  }

  async getById(user: AuthenticatedUser, studyId: string): Promise<StudyDetail> {
    const study = await this.prisma.study.findUnique({
      where: { id: studyId },
      include: STUDY_INCLUDE,
    });

    if (!study) {
      throw new NotFoundAppException('Study not found.');
    }

    // Knowing the UUID is not access (docs/API_CONTRACT.md section 29). The
    // contract asks for an explicit 403 HOSPITAL_ACCESS_DENIED here rather than
    // a 404, so the client can tell "not authorized" from "does not exist"
    // (TASK_QUEUE BACKEND-008).
    this.hospitalScope.assertAllowed(user, study.hospitalId);

    const row = study as unknown as StudyRow;
    return toStudyDetail(row, this.sla.snapshot(row, await this.sla.warningWindows(), new Date()));
  }
}

/**
 * Turns a derived SLA state into a query over the frozen deadline
 * (TASK_QUEUE BACKEND-039).
 *
 * The warning band differs per category, so WARNING and NORMAL fan out into one
 * clause per category. Categories with no active policy carry no deadline, so
 * `slaDeadlineAt: { gt: ... }` excludes them without a special case — which is
 * how YOGUN_BAKIM stays out of SLA lists instead of getting an invented one.
 */
function buildSlaFilter(
  state: SlaState,
  windows: SlaWarningWindows,
  now: Date,
): Record<string, unknown> {
  if (state === SlaState.COMPLETED) {
    return { finalizedAt: { not: null } };
  }

  if (state === SlaState.OVERDUE) {
    return { finalizedAt: null, slaDeadlineAt: { not: null, lte: now } };
  }

  const perCategory = [...windows.entries()].map(([category, minutes]) => {
    const boundary = new Date(now.getTime() + minutes * 60_000);
    return state === SlaState.WARNING
      ? { category, slaDeadlineAt: { gt: now, lte: boundary } }
      : { category, slaDeadlineAt: { gt: boundary } };
  });

  // No active policies at all means nothing can be in a warning band; an empty
  // OR would match everything, so match nothing instead.
  return perCategory.length > 0 ? { finalizedAt: null, OR: perCategory } : { id: { in: [] } };
}

/** Resolves the documented `me` alias to the caller's id. */
function resolveAssignee(value: string | undefined, user: AuthenticatedUser): string | undefined {
  if (!value) return undefined;
  return value === ASSIGNED_TO_ME ? user.id : value;
}

/**
 * Free-text search over the fields the contract requires
 * (docs/API_CONTRACT.md section 103).
 */
function buildSearchFilter(search: string): Record<string, unknown> {
  const contains = { contains: search, mode: 'insensitive' as const };

  return {
    OR: [
      { accessionNumber: contains },
      { studyDescription: contains },
      { patient: { firstName: contains } },
      { patient: { lastName: contains } },
      { patient: { externalPatientId: contains } },
    ],
  };
}
