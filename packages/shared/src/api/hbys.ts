/**
 * HBYS delivery contracts (docs/API_CONTRACT.md sections 64-67).
 *
 * Delivery is asynchronous: a successful finalize means HBYS_PENDING, not that
 * the report reached the hospital. A failure is never hidden, so these shapes
 * always carry enough for an operator to see what went wrong.
 */

import type { HbysDeliveryStatus } from '../enums/hbys';

export interface HbysDeliveryDto {
  id: string;
  studyId: string;
  reportVersionId: string;
  status: HbysDeliveryStatus;
  attemptCount: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  externalReportId: string | null;
  /** ISO 8601. */
  queuedAt: string;
  sentAt: string | null;
  completedAt: string | null;
}

/**
 * One send attempt. Metadata only — request and response bodies are never
 * exposed, since they carry patient and report content.
 */
export interface HbysDeliveryAttemptDto {
  id: string;
  attemptNumber: number;
  status: HbysDeliveryStatus;
  httpStatus: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  /** ISO 8601. */
  startedAt: string;
  completedAt: string | null;
}
