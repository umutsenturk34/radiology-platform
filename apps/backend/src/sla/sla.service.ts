import { Injectable } from '@nestjs/common';
import type { PatientCategory, StudySlaSnapshot } from '@radiology/shared';
import { PrismaService } from '../prisma/prisma.service';
import { deriveSla } from './sla.calculator';

/** Active warning window per category, in minutes. */
export type SlaWarningWindows = ReadonlyMap<PatientCategory, number>;

/** What the SLA engine needs off a study row. */
export interface SlaStudyRow {
  category: string;
  slaDeadlineAt: Date | null;
  finalizedAt: Date | null;
}

/**
 * SLA policy lookup and snapshot derivation (TASK_QUEUE BACKEND-039).
 *
 * The deadline itself is frozen on the study at arrival, so nothing here can
 * move a historical deadline (docs/DATA_MODEL.md section 66). Only the warning
 * band is read live: it is a display threshold relative to a deadline that is
 * already fixed, and re-reading it means an Operation team that widens the band
 * sees the effect immediately instead of only on new studies.
 */
@Injectable()
export class SlaService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Loads the active windows once so a page of studies costs one query rather
   * than one per row. At most one row per category, so this stays tiny.
   */
  async warningWindows(): Promise<SlaWarningWindows> {
    const policies = await this.prisma.slaPolicy.findMany({
      where: { active: true },
      select: { category: true, warningBeforeMinutes: true },
    });

    return new Map(policies.map((p) => [p.category as PatientCategory, p.warningBeforeMinutes]));
  }

  snapshot(study: SlaStudyRow, windows: SlaWarningWindows, now: Date): StudySlaSnapshot {
    return deriveSla({
      deadlineAt: study.slaDeadlineAt,
      finalizedAt: study.finalizedAt,
      // A study can outlive the policy that produced its deadline. Rather than
      // guess a replacement band, fall back to no warning window at all: the
      // study then reads NORMAL until the frozen deadline passes.
      warningBeforeMinutes: windows.get(study.category as PatientCategory) ?? 0,
      now,
    });
  }
}
