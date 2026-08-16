/**
 * Source of truth: docs/API_CONTRACT.md sections 10, 11, 18 and 106-114.
 *
 * The frontend must branch on `error.code`, never on `error.message`.
 */

export const ApiErrorCode = {
  // auth / session
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  USER_INACTIVE: 'USER_INACTIVE',
  USER_SUSPENDED: 'USER_SUSPENDED',

  // authorization
  FORBIDDEN: 'FORBIDDEN',
  HOSPITAL_ACCESS_DENIED: 'HOSPITAL_ACCESS_DENIED',
  /** docs/AUTH_ROLES_PERMISSIONS.md section 97. */
  STUDY_NOT_ASSIGNED_TO_USER: 'STUDY_NOT_ASSIGNED_TO_USER',

  // resource
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',

  // workflow
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  IMAGES_NOT_AVAILABLE: 'IMAGES_NOT_AVAILABLE',
  DICTATION_REQUIRED: 'DICTATION_REQUIRED',

  // locking
  STUDY_LOCKED: 'STUDY_LOCKED',
  LOCK_NOT_OWNED: 'LOCK_NOT_OWNED',
  EXTERNAL_LOCK_CONFLICT: 'EXTERNAL_LOCK_CONFLICT',

  // integrations
  HBYS_NOT_RETRYABLE: 'HBYS_NOT_RETRYABLE',

  // dev tools
  DEV_TOOLS_DISABLED: 'DEV_TOOLS_DISABLED',

  // generic
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

/** The `error` object carried inside an error response body. */
export interface ApiError {
  code: ApiErrorCode | string;
  message: string;
  details?: Record<string, unknown>;
}

/** Full error response body: `{ "error": { ... } }`. */
export interface ApiErrorResponse {
  error: ApiError;
}

/** Shape of `details` for VALIDATION_ERROR (API_CONTRACT.md section 112). */
export interface ValidationErrorDetails extends Record<string, unknown> {
  fields: Record<string, string[]>;
}

export function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  if (typeof value !== 'object' || value === null || !('error' in value)) {
    return false;
  }
  const error = (value as { error: unknown }).error;
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as ApiError).code === 'string' &&
    typeof (error as ApiError).message === 'string'
  );
}
