/** Study lock contract (docs/API_CONTRACT.md sections 33-35 and 104). */

import type { UserRole } from '../enums/user';

/** Only INTERNAL exists until the external hospital lock model is delivered. */
export const StudyLockType = {
  INTERNAL: 'INTERNAL',
} as const;

export type StudyLockType = (typeof StudyLockType)[keyof typeof StudyLockType];

export interface StudyLockInfo {
  locked: boolean;
  type: StudyLockType | null;
  ownerUserId: string | null;
  ownerDisplayName: string | null;
  ownerRole: UserRole | null;
  lockedAt: string | null;
  expiresInSeconds: number | null;
}

export interface AcquiredLockInfo {
  ownerUserId: string;
  ownerRole: UserRole;
  lockedAt: string;
  heartbeatIntervalSeconds: number;
}
