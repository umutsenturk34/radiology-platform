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
