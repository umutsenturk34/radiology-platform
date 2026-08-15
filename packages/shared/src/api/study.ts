/**
 * Study read contracts (docs/API_CONTRACT.md sections 23-29 and 121).
 *
 * Scope note: these types cover what the phase-1 data model can actually
 * answer. `clinicalData`, `pacs`, `lock`, the derived SLA state and the
 * information/revision flags described in API_CONTRACT are added by their own
 * tasks (BACKEND-015 locks, BACKEND-019/020 PACS, BACKEND-039 SLA engine,
 * BACKEND-041 information notes). Nothing here is invented ahead of its model.
 */

import type { PatientCategory } from '../enums/patient';
import type { StudyStatus } from '../enums/study';
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
 * SLA snapshot frozen at arrival (docs/DATA_MODEL.md section 66).
 *
 * Only the stored deadline is exposed for now; `remainingSeconds`,
 * `overdueSeconds` and `state` arrive with the SLA engine (BACKEND-039).
 */
export interface StudySlaSnapshot {
  deadlineAt: string | null;
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
  arrivalAt: string | null;
  sla: StudySlaSnapshot;
  assignment: StudyAssignmentSummary;
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
  assignedDoctorId?: string;
  assignedReporterId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: StudySortField;
  sortOrder?: SortOrder;
}
