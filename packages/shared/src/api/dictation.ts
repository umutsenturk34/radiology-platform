/** Dictation contracts (docs/API_CONTRACT.md sections 38-42). */

import type { DictationStatus } from '../enums/dictation';

/** Multipart field names for `POST /dictations/:id/upload`. */
export const DICTATION_UPLOAD_FIELD = {
  FILE: 'file',
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
  startedAt: string;
  completedAt: string | null;
  uploadedAt: string | null;
  failureReason: string | null;
}

export interface DictationPlaybackDto {
  url: string;
  expiresAt: string;
}
