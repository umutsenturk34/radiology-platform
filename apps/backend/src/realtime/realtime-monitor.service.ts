import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { PatientCategory } from '@radiology/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { StudyLockService } from '../locks/study-lock.service';
import { SlaService } from '../sla/sla.service';
import { AppLogger } from '../common/logging/app-logger.service';
import { RealtimeService } from './realtime.service';

/** How often the sweeps run. Short enough to be useful, long enough to be cheap. */
const SWEEP_INTERVAL_MS = 15_000;

/** How long a "already announced" marker survives. */
const ANNOUNCED_TTL_SECONDS = 24 * 60 * 60;

/**
 * The two realtime events nothing else can produce (TASK_QUEUE BACKEND-045).
 *
 * A lock ending and an SLA deadline passing are not workflow actions — nobody
 * calls an endpoint when they happen. Every other event in this system is
 * emitted by the service that performed the change; these two need something
 * watching the clock instead.
 *
 * Both sweeps derive their events from real state: a lock key that is genuinely
 * gone, and a deadline column that has genuinely passed. Nothing here invents a
 * business state or writes one (CLAUDE.md section 35 — realtime is never the
 * source of truth).
 *
 * The pilot runs a single instance. With several instances this would need a
 * shared leader or a locked sweep, otherwise each would emit the same events;
 * the Redis markers below already deduplicate the SLA half of that.
 */
@Injectable()
export class RealtimeMonitorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger: AppLogger;
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly locks: StudyLockService,
    private readonly sla: SlaService,
    private readonly realtime: RealtimeService,
    logger: AppLogger,
  ) {
    this.logger = logger.child(RealtimeMonitorService.name);
  }

  onModuleInit(): void {
    this.timer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    // Never keep the process alive for a sweep, so tests and shutdown are clean.
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * One pass over both watches.
   *
   * Guarded against overlap: a slow pass must not stack on the next tick and
   * emit the same events twice.
   */
  async sweep(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      await this.sweepExpiredLocks();
      await this.sweepSlaDeadlines();
    } catch (error) {
      // A failed sweep is a missed notification, never a failed business
      // operation; the next tick tries again.
      this.logger.warn({
        message: 'Realtime sweep failed',
        reason: error instanceof Error ? error.message : 'unknown error',
      });
    } finally {
      this.running = false;
    }
  }

  private async sweepExpiredLocks(): Promise<void> {
    const studyIds = await this.locks.takeExpired();
    if (studyIds.length === 0) return;

    const studies = await this.prisma.study.findMany({
      where: { id: { in: studyIds } },
      select: { id: true, hospitalId: true },
    });

    for (const study of studies) {
      // The previous owner is not known any more — the lock is gone, and it is
      // not worth keeping a copy of it just to name them. The reason is what
      // the waiting user needs: the study is free again.
      this.realtime.emitStudyUnlocked(
        { studyId: study.id, hospitalId: study.hospitalId },
        { reason: 'TTL_EXPIRED' },
      );
    }
  }

  private async sweepSlaDeadlines(): Promise<void> {
    const windows = await this.sla.warningWindows();
    if (windows.size === 0) return;

    const now = new Date();
    const maxWindowMs = Math.max(...windows.values()) * 60_000;

    // Anything already past its deadline, or close enough to be inside the
    // widest warning band. Finalized studies are excluded: the clock stops at
    // final approval (WORKFLOW_STATE_MACHINE section 61).
    const candidates = await this.prisma.study.findMany({
      where: {
        finalizedAt: null,
        slaDeadlineAt: { not: null, lte: new Date(now.getTime() + maxWindowMs) },
      },
      select: { id: true, hospitalId: true, category: true, slaDeadlineAt: true },
      take: 500,
    });

    for (const study of candidates) {
      const deadline = study.slaDeadlineAt;
      if (!deadline) continue;

      const category = study.category as PatientCategory;
      const windowMinutes = windows.get(category);
      // No active policy means no warning band to be inside of, and no invented
      // one — the YOGUN_BAKIM case (BLOCKED_SPEC).
      if (windowMinutes === undefined) continue;

      const remainingMs = deadline.getTime() - now.getTime();

      if (remainingMs <= 0) {
        if (await this.announceOnce('overdue', study.id)) {
          this.realtime.emitSlaOverdue(
            { studyId: study.id, hospitalId: study.hospitalId },
            {
              deadlineAt: deadline.toISOString(),
              overdueSeconds: Math.floor(-remainingMs / 1000),
              category,
            },
          );
        }
        continue;
      }

      if (remainingMs <= windowMinutes * 60_000) {
        if (await this.announceOnce('warning', study.id)) {
          this.realtime.emitSlaWarning(
            { studyId: study.id, hospitalId: study.hospitalId },
            {
              deadlineAt: deadline.toISOString(),
              remainingSeconds: Math.floor(remainingMs / 1000),
              category,
            },
          );
        }
      }
    }
  }

  /**
   * True the first time a study crosses a threshold, false afterwards.
   *
   * A sweep every 15 seconds would otherwise announce the same warning four
   * times a minute for hours (docs/REALTIME_EVENTS.md section 46). SET NX makes
   * the check and the claim one atomic step, so two overlapping sweeps cannot
   * both decide they are first.
   */
  private async announceOnce(kind: 'warning' | 'overdue', studyId: string): Promise<boolean> {
    let result: string | null;
    try {
      result = await this.redis.getClient().set(
        `realtime:sla:${kind}:${studyId}`,
        '1',
        'EX',
        ANNOUNCED_TTL_SECONDS,
        'NX',
      );
    } catch {
      // Without Redis there is no way to deduplicate, and repeating the same
      // alert every 15 seconds is worse than missing it.
      return false;
    }

    return result === 'OK';
  }
}
