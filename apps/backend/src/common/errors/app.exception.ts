import { HttpException, HttpStatus } from '@nestjs/common';
import { ApiErrorCode } from '@radiology/shared';

/**
 * Base class for every business/API error the backend raises.
 *
 * Guarantees each error carries a stable machine-readable `code` so the
 * frontend can branch on it (docs/API_CONTRACT.md section 10).
 */
export class AppException extends HttpException {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ApiErrorCode | string,
    message: string,
    status: HttpStatus,
    details?: Record<string, unknown>,
  ) {
    super({ code, message, details }, status);
    this.code = code;
    this.details = details;
  }
}

/** 401 — no or invalid authentication. */
export class UnauthorizedAppException extends AppException {
  constructor(message = 'Authentication is required.', details?: Record<string, unknown>) {
    super(ApiErrorCode.UNAUTHORIZED, message, HttpStatus.UNAUTHORIZED, details);
  }
}

/** 403 — authenticated but not allowed to perform the action. */
export class ForbiddenAppException extends AppException {
  constructor(
    message = 'You are not authorized to perform this action.',
    details?: Record<string, unknown>,
  ) {
    super(ApiErrorCode.FORBIDDEN, message, HttpStatus.FORBIDDEN, details);
  }
}

/** 403 — the user has no access to the hospital owning the resource. */
export class HospitalAccessDeniedException extends AppException {
  constructor(
    message = 'User is not authorized for this hospital.',
    details?: Record<string, unknown>,
  ) {
    super(ApiErrorCode.HOSPITAL_ACCESS_DENIED, message, HttpStatus.FORBIDDEN, details);
  }
}

/** 404 — resource does not exist, or is not visible to this user. */
export class NotFoundAppException extends AppException {
  constructor(message = 'Resource not found.', details?: Record<string, unknown>) {
    super(ApiErrorCode.NOT_FOUND, message, HttpStatus.NOT_FOUND, details);
  }
}

/** 422 — request body failed validation. */
export class ValidationAppException extends AppException {
  constructor(fields: Record<string, string[]>, message = 'Request validation failed.') {
    super(ApiErrorCode.VALIDATION_ERROR, message, HttpStatus.UNPROCESSABLE_ENTITY, { fields });
  }
}

/** 503 — a required dependency (database, Redis, storage) is unavailable. */
export class ServiceUnavailableAppException extends AppException {
  constructor(message = 'A required service is currently unavailable.', dependency?: string) {
    super(
      ApiErrorCode.SERVICE_UNAVAILABLE,
      message,
      HttpStatus.SERVICE_UNAVAILABLE,
      dependency ? { dependency } : undefined,
    );
  }
}
