/**
 * Source of truth: docs/DATA_MODEL.md section 18 and
 * docs/WORKFLOW_STATE_MACHINE.md — both must use the identical enum.
 */

export const StudyStatus = {
  INITIAL: 'INITIAL',
  WAITING_ACCEPTANCE: 'WAITING_ACCEPTANCE',
  IMAGES_PENDING: 'IMAGES_PENDING',

  UNREAD: 'UNREAD',
  READING: 'READING',
  READ: 'READ',

  WAITING_TRANSCRIPTION: 'WAITING_TRANSCRIPTION',
  TRANSCRIBING: 'TRANSCRIBING',
  WAITING_APPROVAL: 'WAITING_APPROVAL',

  FINAL: 'FINAL',

  HBYS_PENDING: 'HBYS_PENDING',
  HBYS_SENT: 'HBYS_SENT',
  HBYS_FAILED: 'HBYS_FAILED',

  IMAGE_MISSING: 'IMAGE_MISSING',
  WONT_REPORT: 'WONT_REPORT',
  HOSPITAL_DOCTOR: 'HOSPITAL_DOCTOR',

  REVISION_REQUESTED: 'REVISION_REQUESTED',
  REVISION_IN_PROGRESS: 'REVISION_IN_PROGRESS',

  ADDENDUM_REQUIRED: 'ADDENDUM_REQUIRED',
} as const;

export type StudyStatus = (typeof StudyStatus)[keyof typeof StudyStatus];

export const STUDY_STATUSES: readonly StudyStatus[] = Object.values(StudyStatus);

/**
 * Derived SLA state (docs/WORKFLOW_STATE_MACHINE.md section 40).
 *
 * Deliberately NOT part of `StudyStatus`: a study can be
 * `WAITING_TRANSCRIPTION` and `OVERDUE` at the same time. `COMPLETED` means the
 * clock stopped at the doctor's final approval (section 61) — a later HBYS
 * failure must not make the report clinically late again.
 */
export const SlaState = {
  NORMAL: 'NORMAL',
  WARNING: 'WARNING',
  OVERDUE: 'OVERDUE',
  COMPLETED: 'COMPLETED',
} as const;

export type SlaState = (typeof SlaState)[keyof typeof SlaState];

export const SLA_STATES: readonly SlaState[] = Object.values(SlaState);
