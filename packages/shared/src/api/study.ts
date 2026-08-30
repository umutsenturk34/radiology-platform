/**
 * Study read contracts (docs/API_CONTRACT.md sections 23-29 and 121).
 *
 * Canonical: the frontend imports these instead of keeping its own copies
 * (API_CONTRACT section 121). Every field here is answerable from real data —
 * nothing is declared ahead of the model behind it. Two documented pieces are
 * therefore still absent and tracked as their own tasks:
 *
 * - `flags.externalLockConflict` — needs `ExternalStudyLock`
 *   (DATA_MODEL section 23), which does not exist. Reporting `false` would be
 *   claiming there is no conflict when the platform cannot know.
 * - `pacs` is NOT embedded here. It lives behind `GET /studies/:id/pacs/viewer`
 *   and `/pacs/series`, so a slow or unreachable PACS cannot delay or fail the
 *   study screen's own data (API_CONTRACT sections 36 and 37).
 */

import type { PatientCategory } from '../enums/patient';
import type { SlaState, StudyStatus } from '../enums/study';
import type { StudyLockInfo } from './lock';
import type { SortOrder } from './pagination';

export interface StudyPatientSummary {
  id: string;
  displayName: string;
  externalPatientId: string;
}

export interface StudyPatientDetail extends StudyPatientSummary {
  birthDate: string | null;
  gender: string | null;
}

export interface StudyHospitalSummary {
  id: string;
  code: string;
  shortName: string | null;
}

export interface StudyHospitalDetail {
  id: string;
  code: string;
  name: string;
}

export interface StudyUserSummary {
  id: string;
  displayName: string;
}

export interface StudyAssignmentSummary {
  doctor: StudyUserSummary | null;
  reporter: StudyUserSummary | null;
}

/**
 * SLA snapshot frozen at arrival (docs/DATA_MODEL.md section 66) plus the state
 * derived from it (BACKEND-039).
 *
 * Every derived field is null when the study has no deadline — either it has
 * not arrived yet, or its category has no active policy. YOGUN_BAKIM is the
 * live case: its duration is undefined (BLOCKED_SPEC), so those studies carry
 * no deadline and no SLA state rather than a guessed one.
 *
 * Once the clock stops, `remainingSeconds` and `overdueSeconds` freeze at what
 * they were on final approval, so a study reported 10 minutes late still reads
 * as 10 minutes late tomorrow.
 */
export interface StudySlaSnapshot {
  deadlineAt: string | null;
  /** Doctor final approval — where the clock stops (WORKFLOW_STATE_MACHINE 61). */
  completedAt: string | null;
  /** Seconds left before the deadline; 0 once it has passed. */
  remainingSeconds: number | null;
  /** Seconds past the deadline; 0 while still inside it. */
  overdueSeconds: number | null;
  state: SlaState | null;
}

/**
 * Operational badges shown next to a study (API_CONTRACT sections 26 and 28).
 *
 * Every one is derived from committed state at read time; none is a stored
 * column, so a flag can never disagree with the row it describes.
 *
 * `externalLockConflict` from section 28 is deliberately not here — see the
 * file header.
 */
export interface StudyFlags {
  /** The study carries at least one information note. */
  hasInformation: boolean;
  /** The study is currently parked as IMAGE_MISSING. */
  imageMissing: boolean;
  /**
   * A revision is open on this study: REVISION_REQUESTED or
   * REVISION_IN_PROGRESS. Derived from the status, which is the only record a
   * revision leaves until `RevisionRequest` (DATA_MODEL section 42) exists — so
   * a revision that has already been completed reads as false.
   */
  hasRevisionRequest: boolean;
  /**
   * The same patient has another study that has not produced a final report
   * (docs/FRONTEND.md section 111). Studies closed as WONT_REPORT do not count:
   * they are not outstanding work.
   *
   * Patients are scoped to one hospital, so this never reveals a study outside
   * the caller's hospital scope.
   */
  hasUnreportedSiblingStudy: boolean;
}

/**
 * Clinical context the hospital sent with the order
 * (docs/DATA_MODEL.md sections 28-29, INTEGRATIONS section 15).
 *
 * Null on a study whose HL7 messages carried no clinical block at all — which
 * the client must show as "not supplied", never as an empty finding.
 */
export interface StudyClinicalData {
  preDiagnosis: string | null;
  requestReason: string | null;
  patientComplaint: string | null;
  previousStudyInfo: string | null;
  requestingPhysician: string | null;
  department: string | null;
  /** Hospital-specific extras that have no internal field of their own. */
  additionalData: Record<string, unknown> | null;
}

export interface StudyListItem {
  id: string;
  accessionNumber: string;
  patient: StudyPatientSummary;
  hospital: StudyHospitalSummary;
  studyDescription: string | null;
  modality: string | null;
  category: PatientCategory;
  status: StudyStatus;
  arrivalAt: string | null;
  sla: StudySlaSnapshot;
  assignment: StudyAssignmentSummary;
  flags: StudyFlags;
}

/** Workflow timestamps recorded on the Study row. */
export interface StudyTimestamps {
  firstHl7ReceivedAt: string | null;
  secondHl7ReceivedAt: string | null;
  imagesAvailableAt: string | null;
  readingStartedAt: string | null;
  readingCompletedAt: string | null;
  transcriptionStartedAt: string | null;
  transcriptionCompletedAt: string | null;
  finalizedAt: string | null;
}

export interface StudyDetail {
  id: string;
  accessionNumber: string;
  status: StudyStatus;
  category: PatientCategory;
  patient: StudyPatientDetail;
  hospital: StudyHospitalDetail;
  study: {
    description: string | null;
    modality: string | null;
    studyInstanceUid: string | null;
    externalOrderId: string | null;
    externalProtocolId: string | null;
  };
  clinicalData: StudyClinicalData | null;
  arrivalAt: string | null;
  sla: StudySlaSnapshot;
  assignment: StudyAssignmentSummary;
  /**
   * Live lock state, the same shape `GET /studies/:id/lock` returns.
   *
   * Read once with the study so the workspace can render "someone else is
   * reading this" without a second round trip; keep it fresh from the
   * `study.locked` / `study.unlocked` realtime events rather than by polling.
   */
  lock: StudyLockInfo;
  flags: StudyFlags;
  timestamps: StudyTimestamps;
}

/**
 * Convenience presets for the operational tabs (API_CONTRACT section 25).
 *
 * The backend maps each preset onto real statuses; the frontend must not build
 * its own status lists.
 */
export const StudyPool = {
  UNREAD: 'UNREAD',
  READ: 'READ',
  WAITING_TRANSCRIPTION: 'WAITING_TRANSCRIPTION',
  WAITING_APPROVAL: 'WAITING_APPROVAL',
  FINALIZED: 'FINALIZED',
  HBYS_FAILED: 'HBYS_FAILED',
  IMAGE_MISSING: 'IMAGE_MISSING',
  WONT_REPORT: 'WONT_REPORT',
  HOSPITAL_DOCTOR: 'HOSPITAL_DOCTOR',
} as const;

export type StudyPool = (typeof StudyPool)[keyof typeof StudyPool];

export const STUDY_POOLS: readonly StudyPool[] = Object.values(StudyPool);

/** Sortable list columns (API_CONTRACT section 16). */
export const StudySortField = {
  ARRIVAL_AT: 'arrivalAt',
  CREATED_AT: 'createdAt',
  SLA_DEADLINE_AT: 'slaDeadlineAt',
  ACCESSION_NUMBER: 'accessionNumber',
  STATUS: 'status',
  CATEGORY: 'category',
} as const;

export type StudySortField = (typeof StudySortField)[keyof typeof StudySortField];

export const STUDY_SORT_FIELDS: readonly StudySortField[] = Object.values(StudySortField);

/**
 * Value accepted by `assignedDoctorId` / `assignedReporterId` to mean the
 * caller (API_CONTRACT section 57).
 */
export const ASSIGNED_TO_ME = 'me';

export interface StudyListQuery {
  hospitalId?: string;
  status?: StudyStatus;
  category?: PatientCategory;
  pool?: StudyPool;
  /** Derived SLA state (API_CONTRACT section 92); not a stored column. */
  slaState?: SlaState;
  assignedDoctorId?: string;
  assignedReporterId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: StudySortField;
  sortOrder?: SortOrder;
}
