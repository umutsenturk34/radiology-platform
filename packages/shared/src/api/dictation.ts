/** Dictation contracts (docs/API_CONTRACT.md sections 38-42). */

import type { DictationStatus } from '../enums/dictation';

export interface DictationDoctorSummary {
  id: string;
  displayName: string;
}

export interface DictationDto {
  id: string;
  studyId: string;
  doctor: DictationDoctorSummary;
  status: DictationStatus;
  mimeType: string | null;
  fileSize: number | null;
  durationMs: number | null;
  /** ISO 8601. */
  startedAt: string;
  completedAt: string | null;
  uploadedAt: string | null;
  /**
   * Why an upload failed. Present so a client never shows a recording as
   * finished when there is no audio behind it.
   */
  failureReason: string | null;
}

/** `GET /dictations/:id/playback` — a short-lived URL, never a public one. */
export interface DictationPlaybackDto {
  url: string;
  /** ISO 8601. */
  expiresAt: string;
}
