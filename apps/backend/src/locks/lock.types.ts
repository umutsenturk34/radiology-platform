import type { UserRole } from '@radiology/shared';

/** What is stored in Redis under `lock:study:{studyId}`. */
export interface StudyLock {
  studyId: string;
  ownerUserId: string;
  ownerDisplayName: string;
  ownerRole: UserRole;
  /** ISO 8601. */
  lockedAt: string;
}

/** Lock state as reported to a client (docs/API_CONTRACT.md section 104). */
export interface StudyLockInfo {
  locked: boolean;
  ownerUserId: string | null;
  ownerDisplayName: string | null;
  ownerRole: UserRole | null;
  lockedAt: string | null;
  expiresInSeconds: number | null;
}

export interface LockOwner {
  userId: string;
  displayName: string;
  role: UserRole;
}
