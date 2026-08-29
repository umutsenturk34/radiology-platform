import { RealtimeMonitorService } from './realtime-monitor.service';
import type { RealtimeService } from './realtime.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import type { StudyLockService } from '../locks/study-lock.service';
import type { SlaService } from '../sla/sla.service';
import type { AppLogger } from '../common/logging/app-logger.service';

/**
 * The two clock-driven events (TASK_QUEUE BACKEND-045).
 *
 * `now` is controlled through the study deadlines rather than by sleeping, so
 * the warning band boundaries are asserted exactly.
 */
describe('RealtimeMonitorService', () => {
  const HOSPITAL = 'hospital-a';
  const MINUTE = 60_000;

  interface StudyRow {
    id: string;
    hospitalId: string;
    category: string;
    slaDeadlineAt: Date | null;
    finalizedAt?: Date | null;
  }

  const build = (options: { expiredLocks?: string[]; studies?: StudyRow[] } = {}) => {
    const studies = options.studies ?? [];
    const unlocked: Array<{ studyId: string; reason: string }> = [];
    const slaEvents: Array<{ kind: string; studyId: string; payload: Record<string, unknown> }> = [];
    const announced = new Set<string>();

    const realtime = {
      emitStudyUnlocked: (ctx: { studyId: string }, payload: { reason: string }) =>
        unlocked.push({ studyId: ctx.studyId, reason: payload.reason }),
      emitSlaWarning: (ctx: { studyId: string }, payload: Record<string, unknown>) =>
        slaEvents.push({ kind: 'warning', studyId: ctx.studyId, payload }),
      emitSlaOverdue: (ctx: { studyId: string }, payload: Record<string, unknown>) =>
        slaEvents.push({ kind: 'overdue', studyId: ctx.studyId, payload }),
    } as unknown as RealtimeService;

    const prisma = {
      study: {
        findMany: ({ where, select }: { where: Record<string, any>; select?: unknown }) => {
          void select;
          // Lock sweep: an id filter. SLA sweep: a deadline filter.
          if (where.id?.in) {
            return Promise.resolve(studies.filter((s) => where.id.in.includes(s.id)));
          }
          const limit = where.slaDeadlineAt?.lte as Date | undefined;
          return Promise.resolve(
            studies.filter(
              (s) =>
                !s.finalizedAt &&
                s.slaDeadlineAt !== null &&
                (!limit || s.slaDeadlineAt <= limit),
            ),
          );
        },
      },
    } as unknown as PrismaService;

    const redis = {
      getClient: () => ({
        // Mirrors SET NX: the first caller wins, later ones get null.
        set: (key: string) => {
          if (announced.has(key)) return Promise.resolve(null);
          announced.add(key);
          return Promise.resolve('OK');
        },
      }),
    } as unknown as RedisService;

    const locks = {
      takeExpired: () => Promise.resolve(options.expiredLocks ?? []),
    } as unknown as StudyLockService;

    const sla = {
      warningWindows: () => Promise.resolve(new Map([['ACIL', 20]])),
    } as unknown as SlaService;

    const logger = { child: () => ({ warn: () => undefined }) } as unknown as AppLogger;

    return {
      service: new RealtimeMonitorService(prisma, redis, locks, sla, realtime, logger),
      unlocked,
      slaEvents,
    };
  };

  const study = (over: Partial<StudyRow> & { id: string }): StudyRow => ({
    hospitalId: HOSPITAL,
    category: 'ACIL',
    slaDeadlineAt: null,
    finalizedAt: null,
    ...over,
  });

  describe('expired locks', () => {
    it('announces a lock that really vanished', async () => {
      const { service, unlocked } = build({
        expiredLocks: ['study-1'],
        studies: [study({ id: 'study-1' })],
      });

      await service.sweep();

      // Redis drops the key silently, so without this nobody waiting on the
      // study would learn it is free again.
      expect(unlocked).toEqual([{ studyId: 'study-1', reason: 'TTL_EXPIRED' }]);
    });

    it('says nothing when no lock expired', async () => {
      const { service, unlocked } = build({ expiredLocks: [] });

      await service.sweep();

      expect(unlocked).toEqual([]);
    });
  });

  describe('sla thresholds', () => {
    const deadlineIn = (minutes: number) => new Date(Date.now() + minutes * MINUTE);

    it('warns once inside the band', async () => {
      const { service, slaEvents } = build({
        studies: [study({ id: 'study-1', slaDeadlineAt: deadlineIn(10) })],
      });

      await service.sweep();

      expect(slaEvents).toHaveLength(1);
      expect(slaEvents[0]).toMatchObject({ kind: 'warning', studyId: 'study-1' });
    });

    it('does not repeat the same warning on every sweep', async () => {
      const { service, slaEvents } = build({
        studies: [study({ id: 'study-1', slaDeadlineAt: deadlineIn(10) })],
      });

      // A sweep runs every 15 seconds; repeating would be four alerts a minute
      // for hours (docs/REALTIME_EVENTS.md section 46).
      await service.sweep();
      await service.sweep();
      await service.sweep();

      expect(slaEvents).toHaveLength(1);
    });

    it('stays quiet outside the band', async () => {
      const { service, slaEvents } = build({
        studies: [study({ id: 'study-1', slaDeadlineAt: deadlineIn(90) })],
      });

      await service.sweep();

      expect(slaEvents).toEqual([]);
    });

    it('reports a passed deadline as overdue, not as a warning', async () => {
      const { service, slaEvents } = build({
        studies: [study({ id: 'study-1', slaDeadlineAt: deadlineIn(-30) })],
      });

      await service.sweep();

      expect(slaEvents).toHaveLength(1);
      expect(slaEvents[0].kind).toBe('overdue');
      expect(slaEvents[0].payload.overdueSeconds as number).toBeGreaterThanOrEqual(29 * 60);
    });

    it('ignores a study whose category has no policy', async () => {
      const { service, slaEvents } = build({
        studies: [
          study({ id: 'study-1', category: 'YOGUN_BAKIM', slaDeadlineAt: deadlineIn(-30) }),
        ],
      });

      await service.sweep();

      // YOGUN_BAKIM has no seeded duration (BLOCKED_SPEC); no band is invented
      // for it, so it produces no SLA event.
      expect(slaEvents).toEqual([]);
    });

    it('ignores a finalized study', async () => {
      const { service, slaEvents } = build({
        studies: [
          study({ id: 'study-1', slaDeadlineAt: deadlineIn(-30), finalizedAt: new Date() }),
        ],
      });

      await service.sweep();

      // The clock stops at final approval (WORKFLOW_STATE_MACHINE section 61).
      expect(slaEvents).toEqual([]);
    });
  });

  it('does not let a slow sweep overlap the next tick', async () => {
    const { service, slaEvents } = build({
      studies: [study({ id: 'study-1', slaDeadlineAt: new Date(Date.now() + 10 * MINUTE) })],
    });

    await Promise.all([service.sweep(), service.sweep(), service.sweep()]);

    expect(slaEvents).toHaveLength(1);
  });
});
