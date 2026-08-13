import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { AppLogger } from '../logging/app-logger.service';

/**
 * Emits one structured log line per completed request.
 *
 * Request bodies are deliberately not logged — they can contain credentials,
 * clinical report text or patient data (CLAUDE.md section 42).
 */
@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger: AppLogger;

  constructor(logger: AppLogger) {
    this.logger = logger.child('HTTP');
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: () => this.record(request, response.statusCode, startedAt),
        error: () => this.record(request, response.statusCode, startedAt),
      }),
    );
  }

  private record(request: Request, statusCode: number, startedAt: number): void {
    this.logger.info({
      message: 'request completed',
      method: request.method,
      path: request.originalUrl ?? request.url,
      statusCode,
      durationMs: Date.now() - startedAt,
    });
  }
}
