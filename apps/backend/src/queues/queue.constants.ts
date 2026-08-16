/** Queue and job names (TASK_QUEUE BACKEND-033). */
export const HBYS_DELIVERY_QUEUE = 'hbys-delivery';

export const HBYS_DELIVERY_JOB = 'send-report';

export interface HbysDeliveryJobData {
  deliveryId: string;
}

/** Injection token for the HBYS delivery queue. */
export const HBYS_QUEUE = Symbol('HBYS_QUEUE');
