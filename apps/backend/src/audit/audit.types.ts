import type { UserRole } from '@radiology/shared';

/**
 * Audit event types (docs/DATA_MODEL.md section 69).
 *
 * A controlled string constant rather than a database enum, so a new event type
 * does not need a migration.
 */
export const AuditEventType = {
  // integration
  HL7_FIRST_RECEIVED: 'HL7_FIRST_RECEIVED',
  HL7_SECOND_RECEIVED: 'HL7_SECOND_RECEIVED',
  HL7_DUPLICATE_IGNORED: 'HL7_DUPLICATE_IGNORED',
  HL7_PATIENT_MISMATCH: 'HL7_PATIENT_MISMATCH',
  IMAGES_AVAILABLE: 'IMAGES_AVAILABLE',

  // clinical entities
  PATIENT_CREATED: 'PATIENT_CREATED',
  STUDY_CREATED: 'STUDY_CREATED',

  // workflow
  STUDY_STATUS_CHANGED: 'STUDY_STATUS_CHANGED',
  STUDY_READING_STARTED: 'STUDY_READING_STARTED',

  STUDY_READING_COMPLETED: 'STUDY_READING_COMPLETED',

  // locking
  STUDY_LOCK_RELEASED: 'STUDY_LOCK_RELEASED',
  STUDY_LOCK_FORCE_RELEASED: 'STUDY_LOCK_FORCE_RELEASED',

  // dictation
  DICTATION_STARTED: 'DICTATION_STARTED',
  DICTATION_UPLOADED: 'DICTATION_UPLOADED',

  // reporting
  TRANSCRIPTION_STARTED: 'TRANSCRIPTION_STARTED',
  REPORT_SUBMITTED: 'REPORT_SUBMITTED',

  // approval and finalization
  APPROVAL_STARTED: 'APPROVAL_STARTED',
  REPORT_EDITED_DURING_APPROVAL: 'REPORT_EDITED_DURING_APPROVAL',
  REPORT_RETURNED_TO_REPORTER: 'REPORT_RETURNED_TO_REPORTER',
  REPORT_FINALIZED: 'REPORT_FINALIZED',

  // information notes
  INFORMATION_NOTE_ADDED: 'INFORMATION_NOTE_ADDED',
  INFORMATION_NOTE_UPDATED: 'INFORMATION_NOTE_UPDATED',

  // hbys
  HBYS_DELIVERY_QUEUED: 'HBYS_DELIVERY_QUEUED',
  HBYS_DELIVERY_SENT: 'HBYS_DELIVERY_SENT',
  HBYS_DELIVERY_FAILED: 'HBYS_DELIVERY_FAILED',
  HBYS_MANUAL_RETRY: 'HBYS_MANUAL_RETRY',
} as const;

export type AuditEventType = (typeof AuditEventType)[keyof typeof AuditEventType];

/** Who performed an action. `SYSTEM` covers integration-driven events. */
export interface AuditActor {
  userId?: string;
  role?: UserRole;
}

export interface AuditEntry {
  eventType: AuditEventType | string;
  actor?: AuditActor;
  hospitalId?: string;
  patientId?: string;
  studyId?: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}
