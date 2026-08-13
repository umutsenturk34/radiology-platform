/** Source of truth: docs/API_CONTRACT.md section 9. */

import type { PaginationMeta } from './pagination';

/** Single-resource success envelope: `{ "data": {...} }`. */
export interface ApiResponse<T> {
  data: T;
}

/** Any successful response body the API can return. */
export type ApiSuccessBody<T> = ApiResponse<T> | { data: T[]; meta: PaginationMeta };

/**
 * Header used to correlate a request across frontend, backend and integration
 * logs (API_CONTRACT.md section 115).
 */
export const REQUEST_ID_HEADER = 'x-request-id';

/** Optional client-supplied idempotency key (API_CONTRACT.md section 116). */
export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
