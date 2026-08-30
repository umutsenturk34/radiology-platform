import type { PatientCategory, StudyStatus } from '@radiology/shared';
import type {
  StudyAssignmentSummary,
  StudyClinicalData,
  StudyDetail,
  StudyFlags,
  StudyListItem,
  StudyLockInfo,
  StudySlaSnapshot,
  StudyUserSummary,
} from '@radiology/shared';

/**
 * Persistence -> API shapes.
 *
 * Prisma rows never reach the client directly (CLAUDE.md section 39), and the
 * mapper is the single place that decides which columns are exposed.
 */

interface PatientRow {
  id: string;
  externalPatientId: string;
  firstName: string;
  lastName: string;
  birthDate?: Date | null;
  gender?: string | null;
}

interface HospitalRow {
  id: string;
  code: string;
  name: string;
  shortName: string | null;
}

interface UserRow {
  id: string;
  firstName: string;
  lastName: string;
}

export interface ClinicalDataRow {
  preDiagnosis: string | null;
  requestReason: string | null;
  patientComplaint: string | null;
  previousStudyInfo: string | null;
  requestingPhysician: string | null;
  department: string | null;
  additionalData: unknown;
}

export interface StudyRow {
  id: string;
  patientId: string;
  accessionNumber: string;
  status: string;
  category: string;
  modality: string | null;
  studyDescription: string | null;
  studyInstanceUid: string | null;
  externalOrderId: string | null;
  externalProtocolId: string | null;
  arrivalAt: Date | null;
  slaDeadlineAt: Date | null;
  firstHl7ReceivedAt: Date | null;
  secondHl7ReceivedAt: Date | null;
  imagesAvailableAt: Date | null;
  readingStartedAt: Date | null;
  readingCompletedAt: Date | null;
  transcriptionStartedAt: Date | null;
  transcriptionCompletedAt: Date | null;
  finalizedAt: Date | null;
  patient: PatientRow;
  hospital: HospitalRow;
  assignedDoctor: UserRow | null;
  assignedReporter: UserRow | null;
}

/** A detail row also carries the 1-1 clinical block, when the hospital sent one. */
export interface StudyDetailRow extends StudyRow {
  clinicalData: ClinicalDataRow | null;
}

export function displayName(user: { firstName: string; lastName: string }): string {
  return `${user.firstName} ${user.lastName}`.trim();
}

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function toUserSummary(user: UserRow | null): StudyUserSummary | null {
  return user ? { id: user.id, displayName: displayName(user) } : null;
}

function toAssignment(study: StudyRow): StudyAssignmentSummary {
  return {
    doctor: toUserSummary(study.assignedDoctor),
    reporter: toUserSummary(study.assignedReporter),
  };
}

export function toClinicalData(row: ClinicalDataRow | null): StudyClinicalData | null {
  if (!row) return null;

  return {
    preDiagnosis: row.preDiagnosis,
    requestReason: row.requestReason,
    patientComplaint: row.patientComplaint,
    previousStudyInfo: row.previousStudyInfo,
    requestingPhysician: row.requestingPhysician,
    department: row.department,
    // Prisma types a JSON column as unknown-ish; anything that is not an object
    // (a bare string, an array) is not the extras map the contract promises.
    additionalData: isPlainObject(row.additionalData) ? row.additionalData : null,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function toStudyListItem(
  study: StudyRow,
  sla: StudySlaSnapshot,
  flags: StudyFlags,
): StudyListItem {
  return {
    id: study.id,
    accessionNumber: study.accessionNumber,
    patient: {
      id: study.patient.id,
      displayName: displayName(study.patient),
      externalPatientId: study.patient.externalPatientId,
    },
    hospital: {
      id: study.hospital.id,
      code: study.hospital.code,
      shortName: study.hospital.shortName,
    },
    studyDescription: study.studyDescription,
    modality: study.modality,
    category: study.category as PatientCategory,
    status: study.status as StudyStatus,
    arrivalAt: toIso(study.arrivalAt),
    sla,
    assignment: toAssignment(study),
    flags,
  };
}

export function toStudyDetail(
  study: StudyDetailRow,
  sla: StudySlaSnapshot,
  lock: StudyLockInfo,
  flags: StudyFlags,
): StudyDetail {
  return {
    id: study.id,
    accessionNumber: study.accessionNumber,
    status: study.status as StudyStatus,
    category: study.category as PatientCategory,
    patient: {
      id: study.patient.id,
      displayName: displayName(study.patient),
      externalPatientId: study.patient.externalPatientId,
      birthDate: toIso(study.patient.birthDate),
      gender: study.patient.gender ?? null,
    },
    hospital: {
      id: study.hospital.id,
      code: study.hospital.code,
      name: study.hospital.name,
    },
    study: {
      description: study.studyDescription,
      modality: study.modality,
      studyInstanceUid: study.studyInstanceUid,
      externalOrderId: study.externalOrderId,
      externalProtocolId: study.externalProtocolId,
    },
    clinicalData: toClinicalData(study.clinicalData),
    arrivalAt: toIso(study.arrivalAt),
    sla,
    assignment: toAssignment(study),
    lock,
    flags,
    timestamps: {
      firstHl7ReceivedAt: toIso(study.firstHl7ReceivedAt),
      secondHl7ReceivedAt: toIso(study.secondHl7ReceivedAt),
      imagesAvailableAt: toIso(study.imagesAvailableAt),
      readingStartedAt: toIso(study.readingStartedAt),
      readingCompletedAt: toIso(study.readingCompletedAt),
      transcriptionStartedAt: toIso(study.transcriptionStartedAt),
      transcriptionCompletedAt: toIso(study.transcriptionCompletedAt),
      finalizedAt: toIso(study.finalizedAt),
    },
  };
}

/** Prisma `include` shared by the list and detail queries. */
export const STUDY_INCLUDE = {
  patient: true,
  hospital: true,
  assignedDoctor: { select: { id: true, firstName: true, lastName: true } },
  assignedReporter: { select: { id: true, firstName: true, lastName: true } },
} as const;
