import type { StudyLockInfo, UserRole } from '@radiology/shared';

// The client-facing lock shape is part of the shared API contract; re-exported
// here so lock code keeps one import.
export type { StudyLockInfo };

/** What is stored in Redis under `lock:study:{studyId}`. */
export interface StudyLock {
  studyId: string;
  ownerUserId: string;
  ownerDisplayName: string;
  ownerRole: UserRole;
  /** ISO 8601. */
  lockedAt: string;
}

export interface LockOwner {
  userId: string;
  displayName: string;
  role: UserRole;
}
