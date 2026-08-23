/**
 * Study lock contract (docs/API_CONTRACT.md sections 33-35 and 104).
 *
 * The frontend needs the owner and the remaining time to explain a 423 to the
 * user, so this shape is part of the shared contract rather than a backend
 * internal.
 */

import type { UserRole } from '../enums/user';

export interface StudyLockInfo {
  locked: boolean;
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
