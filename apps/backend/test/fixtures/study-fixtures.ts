import {
  OTHER_HOSPITAL,
  TEST_HOSPITAL,
  type StoredClinicalData,
  type StoredStudy,
} from './auth-test-harness';

/**
 * Study fixtures spanning two hospitals, so cross-hospital isolation can be
 * asserted over real HTTP (TASK_QUEUE BACKEND-008).
 */

const NO_TIMESTAMPS = {
  firstHl7ReceivedAt: null,
  secondHl7ReceivedAt: null,
  imagesAvailableAt: null,
  readingStartedAt: null,
  readingCompletedAt: null,
  transcriptionStartedAt: null,
  transcriptionCompletedAt: null,
  finalizedAt: null,
};

interface BuildOptions {
  id: string;
  hospital: typeof TEST_HOSPITAL;
  accessionNumber: string;
  status: string;
  category: string;
  arrivalAt: string;
  patientLastName: string;
  externalPatientId: string;
  studyDescription?: string;
  assignedDoctorId?: string | null;
  /** Overrides the arrival+2h default, so SLA states can be built around now. */
  slaDeadlineAt?: Date | null;
  /** Doctor final approval, which stops the SLA clock. */
  finalizedAt?: Date | null;
  /** Lets two studies share a patient, which is what a sibling flag needs. */
  patientId?: string;
  clinicalData?: StoredClinicalData;
}

export function buildStudy(options: BuildOptions): StoredStudy {
  const patientId = options.patientId ?? `patient-${options.id}`;

  return {
    id: options.id,
    hospitalId: options.hospital.id,
    patientId,
    accessionNumber: options.accessionNumber,
    status: options.status,
    category: options.category,
    modality: 'CT',
    studyDescription: options.studyDescription ?? 'BT Toraks',
    studyInstanceUid: null,
    externalOrderId: null,
    externalProtocolId: null,
    arrivalAt: new Date(options.arrivalAt),
    slaDeadlineAt:
      options.slaDeadlineAt !== undefined
        ? options.slaDeadlineAt
        : new Date(new Date(options.arrivalAt).getTime() + 2 * 60 * 60 * 1000),
    ...NO_TIMESTAMPS,
    finalizedAt: options.finalizedAt ?? null,
    assignedDoctorId: options.assignedDoctorId ?? null,
    assignedReporterId: null,
    patient: {
      id: patientId,
      externalPatientId: options.externalPatientId,
      firstName: 'Test',
      lastName: options.patientLastName,
      birthDate: null,
      gender: null,
    },
    hospital: {
      id: options.hospital.id,
      code: options.hospital.code,
      name: options.hospital.name,
      shortName: options.hospital.code.slice(0, 4),
    },
    assignedDoctor: null,
    assignedReporter: null,
    clinicalData: options.clinicalData ?? null,
  };
}

/** Two studies in the authorized hospital, one in a hospital nobody is granted. */
export const STUDY_IN_SCOPE_OLDEST = buildStudy({
  id: '11111111-1111-4111-8111-111111111111',
  hospital: TEST_HOSPITAL,
  accessionNumber: 'ACC-OLD-001',
  status: 'UNREAD',
  category: 'ACIL',
  arrivalAt: '2026-08-15T08:00:00.000Z',
  patientLastName: 'Erken',
  externalPatientId: 'TEST-OLD',
});

export const STUDY_IN_SCOPE_NEWEST = buildStudy({
  id: '22222222-2222-4222-8222-222222222222',
  hospital: TEST_HOSPITAL,
  accessionNumber: 'ACC-NEW-002',
  status: 'WAITING_TRANSCRIPTION',
  category: 'NORMAL',
  arrivalAt: '2026-08-15T11:00:00.000Z',
  patientLastName: 'Gec',
  externalPatientId: 'TEST-NEW',
  studyDescription: 'MR Beyin',
});

export const STUDY_OUT_OF_SCOPE = buildStudy({
  id: '33333333-3333-4333-8333-333333333333',
  hospital: OTHER_HOSPITAL,
  accessionNumber: 'ACC-OTHER-003',
  status: 'UNREAD',
  category: 'ACIL',
  arrivalAt: '2026-08-15T09:00:00.000Z',
  patientLastName: 'Yabanci',
  externalPatientId: 'OTHER-001',
});

export const ALL_STUDIES: StoredStudy[] = [
  STUDY_IN_SCOPE_OLDEST,
  STUDY_IN_SCOPE_NEWEST,
  STUDY_OUT_OF_SCOPE,
];
