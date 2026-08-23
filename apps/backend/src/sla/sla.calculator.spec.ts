import { SlaState } from '@radiology/shared';
import { deriveSla } from './sla.calculator';

/**
 * SLA derivation (TASK_QUEUE BACKEND-039).
 *
 * `now` is an argument, so every boundary is asserted exactly rather than
 * approximately — no sleeping, no tolerance windows, no flakiness.
 */
describe('deriveSla', () => {
  const NOW = new Date('2026-08-23T12:00:00.000Z');
  const WARNING_MINUTES = 20;

  /** A deadline `minutes` away from NOW; negative means already passed. */
  const deadlineIn = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

  const derive = (deadlineAt: Date | null, finalizedAt: Date | null = null) =>
    deriveSla({ deadlineAt, finalizedAt, warningBeforeMinutes: WARNING_MINUTES, now: NOW });

  describe('without a deadline', () => {
    it('derives nothing at all', () => {
      // The YOGUN_BAKIM case: no seeded policy, so no deadline and no invented
      // state (docs/TASK_QUEUE.md BLOCKED_SPEC note).
      expect(derive(null)).toEqual({
        deadlineAt: null,
        completedAt: null,
        remainingSeconds: null,
        overdueSeconds: null,
        state: null,
      });
    });

    it('stays empty even for a finalized study', () => {
      expect(derive(null, NOW).state).toBeNull();
    });
  });

  describe('while the study is in flight', () => {
    it('is NORMAL well before the deadline', () => {
      expect(derive(deadlineIn(120))).toMatchObject({
        state: SlaState.NORMAL,
        remainingSeconds: 7200,
        overdueSeconds: 0,
        completedAt: null,
      });
    });

    it('is NORMAL one second outside the warning band', () => {
      const justOutside = new Date(NOW.getTime() + WARNING_MINUTES * 60_000 + 1000);
      expect(derive(justOutside).state).toBe(SlaState.NORMAL);
    });

    it('is WARNING exactly on the warning boundary', () => {
      expect(derive(deadlineIn(WARNING_MINUTES))).toMatchObject({
        state: SlaState.WARNING,
        remainingSeconds: 1200,
        overdueSeconds: 0,
      });
    });

    it('is WARNING with a second left', () => {
      expect(derive(new Date(NOW.getTime() + 1000)).state).toBe(SlaState.WARNING);
    });

    it('is OVERDUE exactly on the deadline', () => {
      // The deadline is the last moment that counts as met, so reaching it is
      // already late rather than borderline.
      expect(derive(deadlineIn(0))).toMatchObject({
        state: SlaState.OVERDUE,
        remainingSeconds: 0,
        overdueSeconds: 0,
      });
    });

    it('counts how far past the deadline it is', () => {
      expect(derive(deadlineIn(-30))).toMatchObject({
        state: SlaState.OVERDUE,
        remainingSeconds: 0,
        overdueSeconds: 1800,
      });
    });
  });

  describe('once the doctor has approved', () => {
    it('is COMPLETED and stops the clock early', () => {
      // Deadline 2h out, approved 30 minutes in: 90 minutes were left at
      // approval and that is what stays on the record.
      const finalizedAt = new Date(NOW.getTime() - 30 * 60_000);
      expect(derive(new Date(NOW.getTime() + 90 * 60_000), finalizedAt)).toMatchObject({
        state: SlaState.COMPLETED,
        completedAt: finalizedAt.toISOString(),
        remainingSeconds: 7200,
        overdueSeconds: 0,
      });
    });

    it('keeps a missed deadline visible after completion', () => {
      // Reported 10 minutes late: COMPLETED, but the breach is still on record
      // rather than being erased by the approval.
      const deadlineAt = new Date(NOW.getTime() - 40 * 60_000);
      const finalizedAt = new Date(NOW.getTime() - 30 * 60_000);

      expect(derive(deadlineAt, finalizedAt)).toMatchObject({
        state: SlaState.COMPLETED,
        overdueSeconds: 600,
        remainingSeconds: 0,
      });
    });

    it('does not drift as time passes after approval', () => {
      const deadlineAt = deadlineIn(60);
      const finalizedAt = new Date(NOW.getTime() - 10 * 60_000);
      const later = new Date(NOW.getTime() + 10 * 24 * 60 * 60_000);

      // A day later or ten, the frozen numbers are identical — an HBYS failure
      // that keeps the study open must not make it late again
      // (docs/WORKFLOW_STATE_MACHINE.md section 61).
      expect(
        deriveSla({ deadlineAt, finalizedAt, warningBeforeMinutes: WARNING_MINUTES, now: later }),
      ).toEqual(derive(deadlineAt, finalizedAt));
    });
  });

  it('treats a zero warning window as no warning band', () => {
    // What a study whose policy was deactivated falls back to: it reads NORMAL
    // right up to the frozen deadline rather than borrowing another band.
    const oneSecondLeft = new Date(NOW.getTime() + 1000);
    expect(
      deriveSla({
        deadlineAt: oneSecondLeft,
        finalizedAt: null,
        warningBeforeMinutes: 0,
        now: NOW,
      }).state,
    ).toBe(SlaState.NORMAL);
  });
});
