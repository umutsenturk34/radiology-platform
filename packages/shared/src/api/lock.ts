/**
 * Study lock contract (docs/API_CONTRACT.md sections 33-35 and 104).
 *
 * The frontend needs the owner and the remaining time to explain a 423 to the
 * user, so this shape is part of the shared contract rather than a backend
 * internal.
 */

import type { UserRole } from '../enums/user';

/**
 * Where a lock comes from (API_CONTRACT section 28, REALTIME_EVENTS section 24).
 *
 * Only INTERNAL exists today: every lock is one this platform took in Redis.
 * The hospital-side `ExternalStudyLock` of DATA_MODEL section 23 has no model
 * yet, so no second value is declared ahead of it.
 */
export const StudyLockType = {
  INTERNAL: 'INTERNAL',
} as const;

export type StudyLockType = (typeof StudyLockType)[keyof typeof StudyLockType];

export interface StudyLockInfo {
  locked: boolean;
  /** Null exactly when `locked` is false — there is no lock to classify. */
  type: StudyLockType | null;
  ownerUserId: string | null;
  ownerDisplayName: string | null;
  ownerRole: UserRole | null;
  /** ISO 8601. */
  lockedAt: string | null;
  /** Remaining lifetime, or null when nothing holds the lock. */
  expiresInSeconds: number | null;
}

/** Returned by start-reading / start-transcription / start-approval. */
export interface AcquiredLockInfo {
  ownerUserId: string;
  ownerRole: UserRole;
  lockedAt: string;
  /** How often the client should send a heartbeat. */
  heartbeatIntervalSeconds: number;
}
