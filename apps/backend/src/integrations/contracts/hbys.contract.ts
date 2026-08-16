/**
 * HBYS adapter boundary (TASK_QUEUE BACKEND-035,
 * docs/INTEGRATIONS.md sections 36-40).
 *
 * The core delivery service only ever builds a `NormalizedHbysReport` and reads
 * a `HbysDeliveryResult`. Transport, authentication and hospital-specific
 * payload shapes stay inside an adapter, and credentials never reach the core
 * service (section 49).
 */

export interface NormalizedHbysReport {
  hospitalId: string;

  patient: {
    externalPatientId: string;
  };

  study: {
    accessionNumber: string;
  };

  report: {
    versionId: string;
    content: string;
    /** ISO 8601. */
    finalizedAt: string;
    finalizedByDoctorId: string;
  };

  /**
   * Deterministic per finalized report version, so a repeated send is the same
   * logical delivery to the hospital (section 42).
   */
  idempotencyKey: string;
}

export interface HbysDeliverySuccess {
  success: true;
  /** Identifier the hospital assigned to the accepted report. */
  externalReportId?: string;
  rawReference?: string;
}

export interface HbysDeliveryFailure {
  success: false;
  /**
   * Whether another attempt could plausibly succeed. Timeouts, 5xx and network
   * resets are retryable; invalid payloads and auth failures are not
   * (section 40).
   */
  retryable: boolean;
  errorCode: string;
  message: string;
  httpStatus?: number;
}

export type HbysDeliveryResult = HbysDeliverySuccess | HbysDeliveryFailure;

export interface HbysAdapter {
  /** Identifies the adapter in logs and delivery attempts. */
  readonly name: string;

  sendReport(input: NormalizedHbysReport): Promise<HbysDeliveryResult>;
}

/** Injection token for the default (pilot) HBYS adapter. */
export const HBYS_ADAPTER = Symbol('HBYS_ADAPTER');
