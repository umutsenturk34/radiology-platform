/** Dictation contracts (docs/API_CONTRACT.md sections 38-42). */

import type { DictationStatus } from '../enums/dictation';

/**
 * Multipart contract for `POST /dictations/:id/upload`
 * (docs/API_CONTRACT.md section 39).
 *
 * Named here so the browser recorder and the backend interceptor cannot drift:
 * a mismatched field name fails as "an audio file is required", which reads
 * like a recording bug rather than a naming bug.
 *
 * The request is `multipart/form-data`, never a raw body and never a presigned
 * PUT — the pilot uploads through the backend (section 40).
 */
export const DICTATION_UPLOAD_FIELD = {
  /** Required. The recorded audio blob. */
  FILE: 'file',
  /** Optional. Recorded length in milliseconds, as a decimal string. */
  DURATION_MS: 'durationMs',
} as const;

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
