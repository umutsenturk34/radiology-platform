/** Source of truth: docs/DATA_MODEL.md sections 36 and 39. */

export const ReportStatus = {
  DRAFT: 'DRAFT',
  COMPLETED: 'COMPLETED',
  WAITING_APPROVAL: 'WAITING_APPROVAL',
  FINAL: 'FINAL',
  REVISION_DRAFT: 'REVISION_DRAFT',
  SUPERSEDED: 'SUPERSEDED',
} as const;

export type ReportStatus = (typeof ReportStatus)[keyof typeof ReportStatus];

export const REPORT_STATUSES: readonly ReportStatus[] = Object.values(ReportStatus);

/**
 * Pilot uses REPORTER and MANUAL only; the AI values exist for forward
 * compatibility (DATA_MODEL.md section 39).
 */
export const ReportSource = {
  REPORTER: 'REPORTER',
  MANUAL: 'MANUAL',
  AI_DRAFT: 'AI_DRAFT',
  AI_ASSISTED: 'AI_ASSISTED',
} as const;

export type ReportSource = (typeof ReportSource)[keyof typeof ReportSource];

export const REPORT_SOURCES: readonly ReportSource[] = Object.values(ReportSource);
