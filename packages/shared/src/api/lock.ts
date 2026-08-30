/** Study lock contract (docs/API_CONTRACT.md sections 33-35 and 104). */

import type { UserRole } from '../enums/user';

export interface StudyLockInfo {
  locked: boolean;
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
