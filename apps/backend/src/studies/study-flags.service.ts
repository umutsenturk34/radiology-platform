import { Injectable } from '@nestjs/common';
import { StudyStatus, type StudyFlags } from '@radiology/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * A study that has produced a final report (API_CONTRACT section 25).
 *
 * The HBYS states are included deliberately: a delivery failure is an
 * integration problem, not a reason to call the study unreported again
 * (docs/TEST_SCENARIOS.md TS-053).
 */
const REPORTED_STATUSES: StudyStatus[] = [
  StudyStatus.FINAL,
  StudyStatus.HBYS_PENDING,
  StudyStatus.HBYS_SENT,
  StudyStatus.HBYS_FAILED,
];

/** Closed on purpose without a report, so not outstanding work either. */
const CLOSED_WITHOUT_REPORT: StudyStatus[] = [StudyStatus.WONT_REPORT];

/** A revision that is still open (docs/WORKFLOW_STATE_MACHINE.md). */
const OPEN_REVISION_STATUSES: StudyStatus[] = [
  StudyStatus.REVISION_REQUESTED,
  StudyStatus.REVISION_IN_PROGRESS,
];

/** Nothing flagged. Used only as a lookup fallback that cannot be reached. */
export function emptyStudyFlags(): StudyFlags {
  return {
    hasInformation: false,
    imageMissing: false,
    hasRevisionRequest: false,
    hasUnreportedSiblingStudy: false,
  };
}

/** The minimum a study row must carry for its flags to be derived. */
export interface StudyFlagSource {
  id: string;
  patientId: string;
  status: string;
}

/**
 * Operational badges for the study list and detail (API_CONTRACT sections 26
 * and 28, TASK_QUEUE DISCOVERED-004).
 *
 * Every flag is derived from committed state at read time rather than stored,
 * so a badge can never drift from the row it describes. The work is batched:
 * a page of studies costs two extra queries, not two per row.
 *
 * `externalLockConflict` from section 28 is not produced here. It would need
 * `ExternalStudyLock` (DATA_MODEL section 23), which does not exist — and
 * answering `false` would assert there is no conflict when the platform has no
 * way to know.
 */
@Injectable()
export class StudyFlagsService {
  constructor(private readonly prisma: PrismaService) {}

  async forStudies(rows: StudyFlagSource[]): Promise<Map<string, StudyFlags>> {
    const flags = new Map<string, StudyFlags>();
    if (rows.length === 0) return flags;

    const studyIds = rows.map((row) => row.id);
    const patientIds = [...new Set(rows.map((row) => row.patientId))];

    const [notes, openSiblings] = await Promise.all([
      this.prisma.informationNote.findMany({
        where: { studyId: { in: studyIds } },
        select: { studyId: true },
      }),
      // Patients belong to exactly one hospital (DATA_MODEL section 13), so a
      // sibling can never be a study outside the caller's hospital scope.
      this.prisma.study.findMany({
        where: {
          patientId: { in: patientIds },
          status: { notIn: [...REPORTED_STATUSES, ...CLOSED_WITHOUT_REPORT] },
        },
        select: { id: true, patientId: true },
      }),
    ]);

    const withNotes = new Set(notes.map((note) => note.studyId));

    const openByPatient = new Map<string, string[]>();
    for (const sibling of openSiblings) {
      const bucket = openByPatient.get(sibling.patientId);
      if (bucket) bucket.push(sibling.id);
      else openByPatient.set(sibling.patientId, [sibling.id]);
    }

    for (const row of rows) {
      const status = row.status as StudyStatus;

      flags.set(row.id, {
        hasInformation: withNotes.has(row.id),
        imageMissing: status === StudyStatus.IMAGE_MISSING,
        hasRevisionRequest: OPEN_REVISION_STATUSES.includes(status),
        // "Another" study: the row itself is in the open set whenever it is
        // unreported, and a study is never its own sibling.
        hasUnreportedSiblingStudy: (openByPatient.get(row.patientId) ?? []).some(
          (id) => id !== row.id,
        ),
      });
    }

    return flags;
  }

  /** Single-study convenience for the detail read. */
  async forStudy(row: StudyFlagSource): Promise<StudyFlags> {
    const flags = await this.forStudies([row]);
    // forStudies writes an entry per input row; the fallback only keeps the
    // caller free of a non-null assertion.
    return flags.get(row.id) ?? emptyStudyFlags();
  }
}
