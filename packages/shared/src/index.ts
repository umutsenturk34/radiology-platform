/**
 * @radiology/shared
 *
 * Shared enums and API contracts used by both apps/backend and apps/frontend.
 *
 * Rules (AGENTS.md sections 6 and 7):
 * - No Prisma / persistence-specific types belong here.
 * - Changing a contract here requires API_CONTRACT.md to stay consistent.
 */

export * from './enums';
export * from './api';
export * from './realtime';
