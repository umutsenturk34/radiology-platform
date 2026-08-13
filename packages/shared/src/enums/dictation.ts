/** Source of truth: docs/DATA_MODEL.md section 31. */

export const DictationStatus = {
  RECORDING: 'RECORDING',
  UPLOADING: 'UPLOADING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;

export type DictationStatus = (typeof DictationStatus)[keyof typeof DictationStatus];

export const DICTATION_STATUSES: readonly DictationStatus[] = Object.values(DictationStatus);
