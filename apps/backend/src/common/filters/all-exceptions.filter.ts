import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiErrorCode, type ApiErrorResponse } from '@radiology/shared';
import { AppException } from '../errors/app.exception';
import { AppLogger } from '../logging/app-logger.service';

/**
 * Converts every thrown error into the standard error envelope
 * (docs/API_CONTRACT.md section 10).
 *
 * Stack traces and internal messages are never sent to the client
 * (CLAUDE.md section 41).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger: AppLogger;

  constructor(logger: AppLogger) {
    this.logger = logger.child(AllExceptionsFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, body } = this.toErrorResponse(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        {
          message: 'Unhandled request failure',
          method: request.method,
          path: request.url,
          status,
          code: body.error.code,
        },
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.debug({
        message: 'Request rejected',
        method: request.method,
        path: request.url,
        status,
        code: body.error.code,
      });
    }

    response.status(status).json(body);
  }

  private toErrorResponse(exception: unknown): { status: number; body: ApiErrorResponse } {
    if (exception instanceof AppException) {
      return {
        status: exception.getStatus(),
        body: {
          error: {
            code: exception.code,
            message: exception.message,
            details: exception.details ?? {},
          },
        },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      return {
        status,
        body: {
          error: {
            code: defaultCodeForStatus(status),
            message: extractMessage(payload, exception.message),
            details: {},
          },
        },
      };
    }

    // Unknown/unexpected error: never leak internals to the client.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        error: {
          code: ApiErrorCode.INTERNAL_ERROR,
          message: 'An unexpected error occurred.',
          details: {},
        },
      },
    };
  }
}

function defaultCodeForStatus(status: number): string {
  switch (status) {
    case HttpStatus.UNAUTHORIZED:
      return ApiErrorCode.UNAUTHORIZED;
    case HttpStatus.FORBIDDEN:
      return ApiErrorCode.FORBIDDEN;
    case HttpStatus.NOT_FOUND:
      return ApiErrorCode.NOT_FOUND;
    case HttpStatus.CONFLICT:
      return ApiErrorCode.CONFLICT;
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return ApiErrorCode.VALIDATION_ERROR;
    case HttpStatus.TOO_MANY_REQUESTS:
      return ApiErrorCode.RATE_LIMITED;
    case HttpStatus.SERVICE_UNAVAILABLE:
      return ApiErrorCode.SERVICE_UNAVAILABLE;
    case HttpStatus.BAD_REQUEST:
      return ApiErrorCode.VALIDATION_ERROR;
    default:
      return status >= 500 ? ApiErrorCode.INTERNAL_ERROR : ApiErrorCode.CONFLICT;
  }
}

function extractMessage(payload: unknown, fallback: string): string {
  if (typeof payload === 'string') return payload;
  if (typeof payload === 'object' && payload !== null) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message) && message.every((item) => typeof item === 'string')) {
      return message.join(' ');
    }
  }
  return fallback;
}
