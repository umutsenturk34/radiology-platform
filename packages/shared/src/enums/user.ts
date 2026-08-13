/**
 * Source of truth: docs/DATA_MODEL.md sections 5 and 6.
 *
 * Enums are modelled as const objects + union types so that the same symbol is
 * usable as a value and as a type in both the NestJS backend and the Next.js
 * frontend, without depending on Prisma's generated persistence types.
 */

export const UserRole = {
  DOCTOR: 'DOCTOR',
  REPORTER: 'REPORTER',
  OPERATION: 'OPERATION',
  MANAGER: 'MANAGER',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const USER_ROLES: readonly UserRole[] = Object.values(UserRole);

export const UserStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  SUSPENDED: 'SUSPENDED',
} as const;

export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const USER_STATUSES: readonly UserStatus[] = Object.values(UserStatus);
