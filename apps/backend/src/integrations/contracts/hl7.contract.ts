import type { PatientCategory } from '@radiology/shared';

/**
 * HL7 adapter boundary (TASK_QUEUE BACKEND-010, docs/INTEGRATIONS.md 2-20).
 *
 * Everything vendor-specific — segment layout, transport, hospital category
 * codes — stays inside an adapter. Core services only ever see the normalized
 * events below, so a new hospital never changes workflow code
 * (CLAUDE.md section 28).
 */

export const Hl7EventType = {
  FIRST_ORDER: 'FIRST_ORDER',
  STUDY_ACCEPTED: 'STUDY_ACCEPTED',
} as const;

export type Hl7EventType = (typeof Hl7EventType)[keyof typeof Hl7EventType];

/**
 * Clinical fields normalized out of the hospital payload
 * (docs/INTEGRATIONS.md section 15).
 *
 * `additionalData` carries hospital-specific extras that have no internal
 * field, so nothing is silently dropped.
 */
export interface NormalizedClinicalData {
  preDiagnosis?: string;
  requestReason?: string;
  patientComplaint?: string;
  previousStudyInfo?: string;
  requestingPhysician?: string;
  department?: string;
  additionalData?: Record<string, unknown>;
}

export interface NormalizedHl7Patient {
  externalPatientId: string;
  firstName?: string;
  lastName?: string;
  /** ISO 8601 date. */
  birthDate?: string;
  gender?: string;
}

export interface NormalizedHl7Study {
  accessionNumber: string;
  externalOrderId?: string;
  externalProtocolId?: string;
  studyDescription?: string;
  modality?: string;
  category: PatientCategory;
}

/** First message: the order/appointment that creates patient and study. */
export interface NormalizedHl7FirstEvent {
  eventType: typeof Hl7EventType.FIRST_ORDER;
  hospitalId: string;
  /** Hospital-supplied message id, used for duplicate detection when present. */
  externalMessageId?: string;
  patient: NormalizedHl7Patient;
  study: NormalizedHl7Study;
  clinicalData?: NormalizedClinicalData;
  /** ISO 8601 timestamp. */
  receivedAt: string;
}

/** Second message: the study was accepted at the hospital. */
export interface NormalizedHl7SecondEvent {
  eventType: typeof Hl7EventType.STUDY_ACCEPTED;
  hospitalId: string;
  externalMessageId?: string;
  /**
   * Secondary identifier. Not used for matching — it is compared against the
   * matched study so a patient mismatch can be refused
   * (docs/INTEGRATIONS.md sections 10 and 11).
   */
  externalPatientId?: string;
  accessionNumber: string;
  /** ISO 8601 timestamp. */
  acceptedAt: string;
  clinicalData?: NormalizedClinicalData;
}

export type NormalizedHl7Event = NormalizedHl7FirstEvent | NormalizedHl7SecondEvent;

/** Context the adapter needs that does not come from the payload itself. */
export interface Hl7AdapterContext {
  /** Internal hospital UUID resolved before the adapter runs. */
  hospitalId: string;
}

/**
 * Contract every HL7 adapter implements.
 *
 * An adapter is pure translation: it validates and normalizes, and never reads
 * or writes application state. Persistence and workflow belong to the HL7
 * application service.
 */
export interface Hl7Adapter {
  /** Identifies the adapter in logs and in the integration registry. */
  readonly name: string;

  parseFirstEvent(payload: unknown, context: Hl7AdapterContext): NormalizedHl7FirstEvent;

  parseSecondEvent(payload: unknown, context: Hl7AdapterContext): NormalizedHl7SecondEvent;
}

/** Injection token for the default (pilot) HL7 adapter. */
export const HL7_ADAPTER = Symbol('HL7_ADAPTER');
