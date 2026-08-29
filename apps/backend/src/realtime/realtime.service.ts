import { Injectable } from '@nestjs/common';
import {
  RealtimeEventType,
  realtimeRoom,
  type HbysDeliveryFailedPayload,
  type HbysDeliveryPendingPayload,
  type HbysDeliverySentPayload,
  type InformationAddedPayload,
  type InformationUpdatedPayload,
  type PatientCategory,
  type RealtimeActor,
  type SlaOverduePayload,
  type SlaWarningPayload,
  type StudyLockedPayload,
  type StudyStatus,
  type StudyUnlockedPayload,
  type StudyUnlockedReason,
  type StudyWaitingApprovalPayload,
  type UserRole,
} from '@radiology/shared';
import { RealtimeGateway } from './realtime.gateway';
import { createRealtimeEvent } from './realtime.event-factory';

/** Everything a study event needs to find its audience. */
interface StudyContext {
  studyId: string;
  hospitalId: string;
  actor?: RealtimeActor;
}

/**
 * The realtime API domain services see (docs/REALTIME_EVENTS.md section 119).
 *
 * Nothing outside this module touches a Socket.IO server or a room name
 * (section 118). Callers describe what happened; the targeting rules live here.
 *
 * Every method is fire-and-forget by design. Realtime is not the source of
 * truth (section 2), so an emit must never be awaited inside a business
 * transaction or be able to fail one — the gateway swallows and logs its own
 * errors (section 78).
 */
@Injectable()
export class RealtimeService {
  constructor(private readonly gateway: RealtimeGateway) {}

  /**
   * A study event reaches the hospital room, so lists update for everyone
   * entitled to see that study, and the study room, so an open workspace
   * updates even though it is the same delivery (section 23).
   */
  private studyRooms(context: StudyContext): string[] {
    return [realtimeRoom.hospital(context.hospitalId), realtimeRoom.study(context.studyId)];
  }

  emitStudyStatusChanged(
    context: StudyContext,
    payload: { fromStatus: StudyStatus | null; toStatus: StudyStatus },
  ): void {
    this.gateway.emit(
      this.studyRooms(context),
      createRealtimeEvent({
        type: RealtimeEventType.STUDY_STATUS_CHANGED,
        hospitalId: context.hospitalId,
        studyId: context.studyId,
        actor: context.actor,
        payload,
      }),
    );
  }

  emitStudyLocked(context: StudyContext, payload: StudyLockedPayload): void {
    this.gateway.emit(
      this.studyRooms(context),
      createRealtimeEvent({
        type: RealtimeEventType.STUDY_LOCKED,
        hospitalId: context.hospitalId,
        studyId: context.studyId,
        actor: context.actor,
        payload,
      }),
    );
  }

  emitStudyUnlocked(
    context: StudyContext,
    payload: {
      previousOwnerUserId?: string;
      previousOwnerRole?: UserRole;
      reason: StudyUnlockedReason;
      releasedAt?: string;
    },
  ): void {
    const body: StudyUnlockedPayload = {
      ...payload,
      releasedAt: payload.releasedAt ?? new Date().toISOString(),
    };

    this.gateway.emit(
      this.studyRooms(context),
      createRealtimeEvent({
        type: RealtimeEventType.STUDY_UNLOCKED,
        hospitalId: context.hospitalId,
        studyId: context.studyId,
        actor: context.actor,
        payload: body,
      }),
    );
  }

  /**
   * Goes to the assigned doctor's personal room (section 29).
   *
   * Deliberately not the hospital room: another doctor's approval queue is not
   * this doctor's business (section 84). The accompanying status change is
   * what tells the rest of the hospital anything happened.
   */
  emitStudyWaitingApproval(
    context: StudyContext,
    payload: StudyWaitingApprovalPayload,
  ): void {
    this.gateway.emit(
      [realtimeRoom.user(payload.doctorId)],
      createRealtimeEvent({
        type: RealtimeEventType.STUDY_WAITING_APPROVAL,
        hospitalId: context.hospitalId,
        studyId: context.studyId,
        actor: context.actor,
        payload,
      }),
    );
  }

  emitHbysDeliveryPending(context: StudyContext, payload: HbysDeliveryPendingPayload): void {
    this.gateway.emit(
      this.studyRooms(context),
      createRealtimeEvent({
        type: RealtimeEventType.HBYS_DELIVERY_PENDING,
        hospitalId: context.hospitalId,
        studyId: context.studyId,
        actor: context.actor,
        payload,
      }),
    );
  }

  emitHbysDeliverySent(context: StudyContext, payload: HbysDeliverySentPayload): void {
    this.gateway.emit(
      this.studyRooms(context),
      createRealtimeEvent({
        type: RealtimeEventType.HBYS_DELIVERY_SENT,
        hospitalId: context.hospitalId,
        studyId: context.studyId,
        payload,
      }),
    );
  }

  /**
   * Failures go to the same hospital audience as the rest of the study events.
   *
   * That is wider than "Operation and Manager" (section 38), and intentionally
   * so: `GET /studies/:id/hbys-deliveries` is already readable by any role with
   * hospital access, because a delivery failure must be visible where the study
   * is (CLAUDE.md section 25). Realtime matches REST rather than inventing a
   * narrower or wider rule.
   */
  emitHbysDeliveryFailed(context: StudyContext, payload: HbysDeliveryFailedPayload): void {
    this.gateway.emit(
      this.studyRooms(context),
      createRealtimeEvent({
        type: RealtimeEventType.HBYS_DELIVERY_FAILED,
        hospitalId: context.hospitalId,
        studyId: context.studyId,
        payload,
      }),
    );
  }

  emitInformationAdded(context: StudyContext, payload: InformationAddedPayload): void {
    this.gateway.emit(
      this.studyRooms(context),
      createRealtimeEvent({
        type: RealtimeEventType.INFORMATION_ADDED,
        hospitalId: context.hospitalId,
        studyId: context.studyId,
        actor: context.actor,
        payload,
      }),
    );
  }

  emitInformationUpdated(context: StudyContext, payload: InformationUpdatedPayload): void {
    this.gateway.emit(
      this.studyRooms(context),
      createRealtimeEvent({
        type: RealtimeEventType.INFORMATION_UPDATED,
        hospitalId: context.hospitalId,
        studyId: context.studyId,
        actor: context.actor,
        payload,
      }),
    );
  }

  emitSlaWarning(
    context: Omit<StudyContext, 'actor'>,
    payload: { deadlineAt: string; remainingSeconds: number; category: PatientCategory },
  ): void {
    this.gateway.emit(
      this.studyRooms(context),
      createRealtimeEvent<SlaWarningPayload>({
        type: RealtimeEventType.SLA_WARNING,
        hospitalId: context.hospitalId,
        studyId: context.studyId,
        payload,
      }),
    );
  }

  emitSlaOverdue(
    context: Omit<StudyContext, 'actor'>,
    payload: { deadlineAt: string; overdueSeconds: number; category: PatientCategory },
  ): void {
    this.gateway.emit(
      this.studyRooms(context),
      createRealtimeEvent<SlaOverduePayload>({
        type: RealtimeEventType.SLA_OVERDUE,
        hospitalId: context.hospitalId,
        studyId: context.studyId,
        payload,
      }),
    );
  }
}
