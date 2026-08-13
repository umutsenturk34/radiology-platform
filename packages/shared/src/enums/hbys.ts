/** Source of truth: docs/DATA_MODEL.md section 56. */

export const HbysDeliveryStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  SENT: 'SENT',
  FAILED: 'FAILED',
} as const;

export type HbysDeliveryStatus = (typeof HbysDeliveryStatus)[keyof typeof HbysDeliveryStatus];

export const HBYS_DELIVERY_STATUSES: readonly HbysDeliveryStatus[] =
  Object.values(HbysDeliveryStatus);
