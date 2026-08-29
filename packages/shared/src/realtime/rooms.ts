/**
 * Room naming (docs/REALTIME_EVENTS.md sections 11-16).
 *
 * Shared so the backend and any client debugging tool agree on the strings.
 * Membership is decided by the server alone: a client cannot join a study room
 * by guessing a UUID (section 16).
 */

export const realtimeRoom = {
  user: (userId: string) => `user:${userId}`,
  role: (role: string) => `role:${role}`,
  hospital: (hospitalId: string) => `hospital:${hospitalId}`,
  study: (studyId: string) => `study:${studyId}`,
} as const;
