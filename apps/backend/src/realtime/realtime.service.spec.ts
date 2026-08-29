import { RealtimeEventType, realtimeRoom } from '@radiology/shared';
import { RealtimeService } from './realtime.service';
import type { RealtimeGateway } from './realtime.gateway';

/**
 * Event targeting (TASK_QUEUE BACKEND-045).
 *
 * Who receives an event IS the security boundary here: realtime must never be
 * looser than REST (docs/REALTIME_EVENTS.md section 81), so these assert the
 * rooms rather than just that something was emitted.
 */
describe('RealtimeService', () => {
  const CONTEXT = { studyId: 'study-1', hospitalId: 'hospital-a' };

  const build = () => {
    const emitted: Array<{ rooms: string[]; event: { type: string; payload: unknown } }> = [];
    const gateway = {
      emit: (rooms: string[], event: { type: string; payload: unknown }) =>
        emitted.push({ rooms, event }),
    } as unknown as RealtimeGateway;

    return { service: new RealtimeService(gateway), emitted };
  };

  describe('envelope', () => {
    it('stamps every event with an id, a type and a UTC timestamp', () => {
      const { service, emitted } = build();

      service.emitStudyStatusChanged(CONTEXT, { fromStatus: 'UNREAD', toStatus: 'READING' });

      const [{ event }] = emitted as unknown as Array<{ event: Record<string, unknown> }>;
      expect(event).toMatchObject({
        type: RealtimeEventType.STUDY_STATUS_CHANGED,
        hospitalId: 'hospital-a',
        studyId: 'study-1',
        payload: { fromStatus: 'UNREAD', toStatus: 'READING' },
      });
      expect(event.eventId).toEqual(expect.any(String));
      expect(event.occurredAt).toMatch(/Z$/);
    });

    it('gives two events different ids, so a client can deduplicate', () => {
      const { service, emitted } = build();

      service.emitStudyStatusChanged(CONTEXT, { fromStatus: 'UNREAD', toStatus: 'READING' });
      service.emitStudyStatusChanged(CONTEXT, { fromStatus: 'READING', toStatus: 'READ' });

      const ids = (emitted as unknown as Array<{ event: { eventId: string } }>).map(
        (entry) => entry.event.eventId,
      );
      expect(new Set(ids).size).toBe(2);
    });

    it('omits the actor for events nobody performed', () => {
      const { service, emitted } = build();

      // A TTL expiry has no actor; an empty actor object would imply one.
      service.emitStudyUnlocked(CONTEXT, { reason: 'TTL_EXPIRED' });

      expect(emitted[0].event).not.toHaveProperty('actor');
    });

    it('carries the actor when a user caused the change', () => {
      const { service, emitted } = build();

      service.emitStudyStatusChanged(
        { ...CONTEXT, actor: { userId: 'u-doctor', role: 'DOCTOR' } },
        { fromStatus: 'UNREAD', toStatus: 'READING' },
      );

      expect(emitted[0].event).toMatchObject({ actor: { userId: 'u-doctor', role: 'DOCTOR' } });
    });
  });

  describe('hospital targeting', () => {
    it.each([
      ['status changed', (s: RealtimeService) => s.emitStudyStatusChanged(CONTEXT, { fromStatus: 'UNREAD', toStatus: 'READING' })], // prettier-ignore
      ['locked', (s: RealtimeService) => s.emitStudyLocked(CONTEXT, { ownerUserId: 'u', ownerDisplayName: 'U', ownerRole: 'DOCTOR', lockedAt: 'now', lockType: 'INTERNAL' })], // prettier-ignore
      ['unlocked', (s: RealtimeService) => s.emitStudyUnlocked(CONTEXT, { reason: 'USER_RELEASED' })], // prettier-ignore
      ['hbys sent', (s: RealtimeService) => s.emitHbysDeliverySent(CONTEXT, { deliveryId: 'd', reportVersionId: 'v', sentAt: 'now' })], // prettier-ignore
      ['hbys failed', (s: RealtimeService) => s.emitHbysDeliveryFailed(CONTEXT, { deliveryId: 'd', reportVersionId: 'v', failedAt: 'now', errorCode: 'X', message: 'm', attemptCount: 1, retryable: false })], // prettier-ignore
      ['information added', (s: RealtimeService) => s.emitInformationAdded(CONTEXT, { noteId: 'n', authorUserId: 'u', authorDisplayName: 'U', authorRole: 'DOCTOR', createdAt: 'now' })], // prettier-ignore
      ['sla warning', (s: RealtimeService) => s.emitSlaWarning(CONTEXT, { deadlineAt: 'now', remainingSeconds: 60, category: 'ACIL' })], // prettier-ignore
    ])('sends %s to the hospital and study rooms only', (_label, emit) => {
      const { service, emitted } = build();

      emit(service);

      // The hospital room is what keeps a study event away from another
      // hospital's users (section 82).
      expect(emitted[0].rooms).toEqual([
        realtimeRoom.hospital('hospital-a'),
        realtimeRoom.study('study-1'),
      ]);
    });

    it('never targets a role room, which would bypass hospital scope', () => {
      const { service, emitted } = build();

      service.emitHbysDeliveryFailed(CONTEXT, {
        deliveryId: 'd',
        reportVersionId: 'v',
        failedAt: 'now',
        errorCode: 'X',
        message: 'm',
        attemptCount: 3,
        retryable: false,
      });

      // A role room spans hospitals; sending there would leak another
      // hospital's failure to Operation (section 13).
      expect(emitted[0].rooms.some((room) => room.startsWith('role:'))).toBe(false);
    });
  });

  describe('user targeting', () => {
    it('sends waiting approval to the assigned doctor alone', () => {
      const { service, emitted } = build();

      service.emitStudyWaitingApproval(CONTEXT, {
        doctorId: 'u-doctor',
        reportId: 'r',
        reportVersionId: 'v',
        submittedAt: 'now',
      });

      // Another doctor's approval queue is not this doctor's business
      // (section 84), so this is deliberately NOT a hospital broadcast.
      expect(emitted[0].rooms).toEqual([realtimeRoom.user('u-doctor')]);
    });
  });
});
