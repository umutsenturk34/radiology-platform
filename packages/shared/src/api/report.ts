/**
 * Report contracts (docs/API_CONTRACT.md sections 51-56 and 61-62).
 *
 * A finalized version is never rewritten, so a client should treat every
 * version as immutable history and read `currentVersion` for the active one.
 */

import type { ReportSource, ReportStatus } from '../enums/report';

export interface ReportAuthorSummary {
  id: string;
  displayName: string;
}

export interface ReportVersionDto {
  id: string;
  versionNumber: number;
  content: string;
  source: ReportSource;
  status: ReportStatus;
  createdBy: ReportAuthorSummary;
  /** ISO 8601. */
  createdAt: string;
  completedAt: string | null;
  finalizedAt: string | null;
}

export interface ReportDto {
  id: string;
  studyId: string;
  status: ReportStatus;
  currentVersion: ReportVersionDto | null;
  /** ISO 8601, set once the doctor finalizes. */
  finalizedAt: string | null;
}

/** `PUT /studies/:id/report/draft`. */
export interface SaveReportDraftResult {
  reportId: string;
  versionId: string;
  status: ReportStatus;
  savedAt: string;
}
