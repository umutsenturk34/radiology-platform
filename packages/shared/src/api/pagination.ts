/** Source of truth: docs/API_CONTRACT.md sections 9, 15 and 16. */

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 25;
/** Pilot hard ceiling — requests above this must be rejected or clamped. */
export const MAX_PAGE_SIZE = 100;

export const SortOrder = {
  ASC: 'asc',
  DESC: 'desc',
} as const;

export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder];

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** List response envelope: `{ "data": [...], "meta": {...} }`. */
export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

/** Common list query parameters. */
export interface PaginationQuery {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: SortOrder;
}

export function buildPaginationMeta(
  page: number,
  pageSize: number,
  total: number,
): PaginationMeta {
  return {
    page,
    pageSize,
    total,
    totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
  };
}
