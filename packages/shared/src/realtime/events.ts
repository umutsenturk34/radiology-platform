import type { PatientCategory } from '../enums/patient';
import type { StudyStatus } from '../enums/study';
import type { UserRole } from '../enums/user';

/**
 * Realtime event contract (docs/REALTIME_EVENTS.md).
 *
 * Canonical here so the backend emitter and the frontend listener cannot drift
 * (section 125). Realtime is NOT a source of truth (section 2): a client that
 * misses an event must still be able to recover the real state from REST, so
 * every payload stays small and identifier-shaped rather than carrying the
 * business object itself (section 80).
 */

/** Server -> client event names, lowercase dot notation (section 6). */
export const RealtimeEventType = {
  STUDY_STATUS_CHANGED: 'study.status.changed',
  STUDY_LOCKED: 'study.locked',
  STUDY_UNLOCKED: 'study.unlocked',
  STUDY_WAITING_APPROVAL: 'study.waiting_approval',

  HBYS_DELIVERY_PENDING: 'hbys.delivery.pending',
  HBYS_DELIVERY_SENT: 'hbys.delivery.sent',
  HBYS_DELIVERY_FAILED: 'hbys.delivery.failed',

  SLA_WARNING: 'sla.warning',
  SLA_OVERDUE: 'sla.overdue',

  INFORMATION_ADDED: 'information.added',
  INFORMATION_UPDATED: 'information.updated',
} as const;

export type RealtimeEventType = (typeof RealtimeEventType)[keyof typeof RealtimeEventType];

export const REALTIME_EVENT_TYPES: readonly RealtimeEventType[] = Object.values(RealtimeEventType);

/**
 * Client -> server commands (section 72).
 *
 * Deliberately separate from the event names above: commands ask, events
 * inform. No business mutation is ever a command — start-reading, finalize and
 * submit-report stay on REST (section 74).
 */
export const RealtimeCommand = {
  STUDY_JOIN: 'study.join',
  STUDY_LEAVE: 'study.leave',
} as const;

export type RealtimeCommand = (typeof RealtimeCommand)[keyof typeof RealtimeCommand];

/** Errors a command acknowledgement can carry (section 111). */
export const RealtimeErrorCode = {
  SOCKET_UNAUTHORIZED: 'SOCKET_UNAUTHORIZED',
  SOCKET_FORBIDDEN: 'SOCKET_FORBIDDEN',
  STUDY_ROOM_ACCESS_DENIED: 'STUDY_ROOM_ACCESS_DENIED',
} as const;

export type RealtimeErrorCode = (typeof RealtimeErrorCode)[keyof typeof RealtimeErrorCode];

/** Acknowledgement returned to a client command (section 73). */
export type RealtimeAck =
  | { ok: true }
  | { ok: false; code: RealtimeErrorCode; message: string };

export interface RealtimeActor {
  userId?: string;
  role?: UserRole;
}

/** Common envelope for every event (section 3). */
export interface RealtimeEvent<TPayload = unknown> {
  /**
   * Unique per emission. Lets a client drop a duplicate it has already handled
   * (section 100) and ties an event to a log line when debugging.
   */
  eventId: string;
  type: RealtimeEventType;
  /** ISO 8601 UTC (section 5). */
  occurredAt: string;
  hospitalId?: string;
  studyId?: string;
  actor?: RealtimeActor;
  payload: TPayload;
}

export interface StudyStatusChangedPayload {
  fromStatus: StudyStatus | null;
  toStatus: StudyStatus;
}

export interface StudyLockedPayload {
  ownerUserId: string;
  ownerDisplayName: string;
  ownerRole: UserRole;
  lockedAt: string;
  lockType: 'INTERNAL';
}

/**
 * Why a lock ended (section 25).
 *
 * A force release is not its own event — it is this one with
 * `FORCE_RELEASED` (section 27).
 */
export const StudyUnlockedReason = {
  WORKFLOW_COMPLETED: 'WORKFLOW_COMPLETED',
  USER_RELEASED: 'USER_RELEASED',
  TTL_EXPIRED: 'TTL_EXPIRED',
  FORCE_RELEASED: 'FORCE_RELEASED',
} as const;

export type StudyUnlockedReason =
  (typeof StudyUnlockedReason)[keyof typeof StudyUnlockedReason];

export interface StudyUnlockedPayload {
  previousOwnerUserId?: string;
  previousOwnerRole?: UserRole;
  releasedAt: string;
  reason: StudyUnlockedReason;
}

export interface StudyWaitingApprovalPayload {
  doctorId: string;
  reportId: string;
  reportVersionId: string;
  submittedAt: string;
}

export interface HbysDeliveryPendingPayload {
  deliveryId: string;
  reportVersionId: string;
  queuedAt: string;
}

export interface HbysDeliverySentPayload {
  deliveryId: string;
  reportVersionId: string;
  sentAt: string;
  externalReportId?: string;
}

export interface HbysDeliveryFailedPayload {
  deliveryId: string;
  reportVersionId: string;
  failedAt: string;
  errorCode: string;
  message: string;
  attemptCount: number;
  retryable: boolean;
}

export interface SlaWarningPayload {
  deadlineAt: string;
  remainingSeconds: number;
  category: PatientCategory;
}

export interface SlaOverduePayload {
  deadlineAt: string;
  overdueSeconds: number;
  category: PatientCategory;
}

/**
 * Note metadata only. The content itself is never broadcast — a hospital room
 * is wider than the set of people entitled to read a note, so the client
 * fetches it over REST where authorization already applies (section 51).
 */
export interface InformationAddedPayload {
  noteId: string;
  authorUserId: string;
  authorDisplayName: string;
  authorRole: UserRole;
  createdAt: string;
}

export interface InformationUpdatedPayload {
  noteId: string;
  updatedByUserId: string;
  updatedAt: string;
  versionCount: number;
}

/** Maps each event type to its payload, so a listener can narrow on `type`. */
export interface RealtimeEventPayloads {
  [RealtimeEventType.STUDY_STATUS_CHANGED]: StudyStatusChangedPayload;
  [RealtimeEventType.STUDY_LOCKED]: StudyLockedPayload;
  [RealtimeEventType.STUDY_UNLOCKED]: StudyUnlockedPayload;
  [RealtimeEventType.STUDY_WAITING_APPROVAL]: StudyWaitingApprovalPayload;
  [RealtimeEventType.HBYS_DELIVERY_PENDING]: HbysDeliveryPendingPayload;
  [RealtimeEventType.HBYS_DELIVERY_SENT]: HbysDeliverySentPayload;
  [RealtimeEventType.HBYS_DELIVERY_FAILED]: HbysDeliveryFailedPayload;
  [RealtimeEventType.SLA_WARNING]: SlaWarningPayload;
  [RealtimeEventType.SLA_OVERDUE]: SlaOverduePayload;
  [RealtimeEventType.INFORMATION_ADDED]: InformationAddedPayload;
  [RealtimeEventType.INFORMATION_UPDATED]: InformationUpdatedPayload;
}

/** A realtime event narrowed to one type. */
export type TypedRealtimeEvent<T extends RealtimeEventType> = RealtimeEvent<
  RealtimeEventPayloads[T]
> & { type: T };
