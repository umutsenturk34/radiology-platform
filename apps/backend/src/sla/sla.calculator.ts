import { SlaState, type StudySlaSnapshot } from '@radiology/shared';

/** One minute in milliseconds — the unit every policy is expressed in. */
const MS_PER_MINUTE = 60_000;

export interface SlaInput {
  /** The deadline frozen at arrival; null before arrival or with no policy. */
  deadlineAt: Date | null;
  /** Doctor final approval. Null while the study is still in flight. */
  finalizedAt: Date | null;
  /** How long before the deadline the study counts as at risk. */
  warningBeforeMinutes: number;
  now: Date;
}

/**
 * Derives the SLA view of a study (TASK_QUEUE BACKEND-039).
 *
 * Pure on purpose: the whole policy lives in one function that takes `now` as
 * an argument, so every branch — including the warning band boundaries — is
 * testable without touching the clock.
 *
 * Rules, all from docs/WORKFLOW_STATE_MACHINE.md sections 40 and 61:
 *   - no deadline           -> everything null (never a guessed state)
 *   - finalized             -> COMPLETED, counters frozen at approval time
 *   - past the deadline     -> OVERDUE
 *   - inside the warning    -> WARNING
 *   - otherwise             -> NORMAL
 *
 * A study finalized after its deadline stays COMPLETED with a non-zero
 * `overdueSeconds`: it was late, and it is no longer running late. Collapsing
 * that into OVERDUE would keep punishing a finished report, and collapsing it
 * into a bare COMPLETED would hide the breach from Operation.
 */
export function deriveSla({
  deadlineAt,
  finalizedAt,
  warningBeforeMinutes,
  now,
}: SlaInput): StudySlaSnapshot {
  if (!deadlineAt) {
    // No policy, no deadline, no invented state (YOGUN_BAKIM is BLOCKED_SPEC).
    return { deadlineAt: null, completedAt: null, remainingSeconds: null, overdueSeconds: null, state: null }; // prettier-ignore
  }

  // The clock stops at final approval; until then it runs against the wall.
  const measuredAt = finalizedAt ?? now;
  const deltaMs = deadlineAt.getTime() - measuredAt.getTime();

  const remainingSeconds = Math.max(0, Math.floor(deltaMs / 1000));
  const overdueSeconds = Math.max(0, Math.floor(-deltaMs / 1000));

  return {
    deadlineAt: deadlineAt.toISOString(),
    completedAt: finalizedAt?.toISOString() ?? null,
    remainingSeconds,
    overdueSeconds,
    state: resolveState({ finalizedAt, deltaMs, warningBeforeMinutes }),
  };
}

function resolveState({
  finalizedAt,
  deltaMs,
  warningBeforeMinutes,
}: {
  finalizedAt: Date | null;
  deltaMs: number;
  warningBeforeMinutes: number;
}): SlaState {
  if (finalizedAt) {
    return SlaState.COMPLETED;
  }
  if (deltaMs <= 0) {
    return SlaState.OVERDUE;
  }
  if (deltaMs <= warningBeforeMinutes * MS_PER_MINUTE) {
    return SlaState.WARNING;
  }
  return SlaState.NORMAL;
}
