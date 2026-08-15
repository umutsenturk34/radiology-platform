import { StudyStatus } from '@radiology/shared';

/**
 * The allowed study transitions (docs/WORKFLOW_STATE_MACHINE.md section 38).
 *
 * This table is the single source of truth for what may follow what. Anything
 * not listed here is refused — the pilot fails closed rather than inventing a
 * clinical path (CLAUDE.md section 11).
 */
export const ALLOWED_TRANSITIONS: Readonly<Record<StudyStatus, readonly StudyStatus[]>> = {
  [StudyStatus.INITIAL]: [StudyStatus.WAITING_ACCEPTANCE],
  [StudyStatus.WAITING_ACCEPTANCE]: [StudyStatus.IMAGES_PENDING],
  [StudyStatus.IMAGES_PENDING]: [StudyStatus.UNREAD],

  [StudyStatus.UNREAD]: [
    StudyStatus.READING,
    StudyStatus.WONT_REPORT,
    StudyStatus.HOSPITAL_DOCTOR,
  ],
  [StudyStatus.READING]: [StudyStatus.READ, StudyStatus.IMAGE_MISSING],
  [StudyStatus.READ]: [StudyStatus.WAITING_TRANSCRIPTION],

  [StudyStatus.WAITING_TRANSCRIPTION]: [StudyStatus.TRANSCRIBING],
  [StudyStatus.TRANSCRIBING]: [StudyStatus.WAITING_APPROVAL],
  // Approval may send the report back to the reporter (section 57).
  [StudyStatus.WAITING_APPROVAL]: [StudyStatus.FINAL, StudyStatus.WAITING_TRANSCRIPTION],

  [StudyStatus.FINAL]: [StudyStatus.HBYS_PENDING],
  [StudyStatus.HBYS_PENDING]: [StudyStatus.HBYS_SENT, StudyStatus.HBYS_FAILED],
  // Manual or automatic retry re-queues a failed delivery.
  [StudyStatus.HBYS_FAILED]: [StudyStatus.HBYS_PENDING],
  // HBYS_SENT is not terminal: a revision or addendum can follow (section 39).
  [StudyStatus.HBYS_SENT]: [StudyStatus.REVISION_REQUESTED, StudyStatus.ADDENDUM_REQUIRED],

  [StudyStatus.IMAGE_MISSING]: [StudyStatus.UNREAD],
  [StudyStatus.WONT_REPORT]: [StudyStatus.UNREAD],
  [StudyStatus.HOSPITAL_DOCTOR]: [StudyStatus.UNREAD],

  [StudyStatus.REVISION_REQUESTED]: [StudyStatus.REVISION_IN_PROGRESS],
  [StudyStatus.REVISION_IN_PROGRESS]: [StudyStatus.WAITING_APPROVAL],

  [StudyStatus.ADDENDUM_REQUIRED]: [],
};

export function isTransitionAllowed(from: StudyStatus, to: StudyStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Study columns stamped when a transition happens
 * (docs/WORKFLOW_STATE_MACHINE.md section 58).
 *
 * Recorded on the Study row as well as in the history table, because the
 * manager duration reports read them directly.
 *
 * `imagesAvailableAt` is deliberately absent: UNREAD is also reached from
 * IMAGE_MISSING and WONT_REPORT, so stamping it here would record an image
 * arrival that never happened. The images-available flow sets it explicitly.
 */
export const TRANSITION_TIMESTAMP_FIELD: Partial<Record<StudyStatus, string>> = {
  [StudyStatus.READING]: 'readingStartedAt',
  [StudyStatus.READ]: 'readingCompletedAt',
  [StudyStatus.TRANSCRIBING]: 'transcriptionStartedAt',
  [StudyStatus.WAITING_APPROVAL]: 'transcriptionCompletedAt',
  [StudyStatus.FINAL]: 'finalizedAt',
};
