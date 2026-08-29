import { randomUUID } from 'node:crypto';
import type { RealtimeActor, RealtimeEvent, RealtimeEventType } from '@radiology/shared';

export interface CreateRealtimeEventInput<TPayload> {
  type: RealtimeEventType;
  payload: TPayload;
  hospitalId?: string;
  studyId?: string;
  actor?: RealtimeActor;
}

/**
 * Single place an envelope is built (docs/REALTIME_EVENTS.md section 120).
 *
 * Every event therefore carries an `eventId` a client can deduplicate on and an
 * `occurredAt` in ISO 8601 UTC, without each call site remembering to add them.
 */
export function createRealtimeEvent<TPayload>({
  type,
  payload,
  hospitalId,
  studyId,
  actor,
}: CreateRealtimeEventInput<TPayload>): RealtimeEvent<TPayload> {
  return {
    eventId: randomUUID(),
    type,
    occurredAt: new Date().toISOString(),
    ...(hospitalId ? { hospitalId } : {}),
    ...(studyId ? { studyId } : {}),
    ...(actor && (actor.userId || actor.role) ? { actor } : {}),
    payload,
  };
}
