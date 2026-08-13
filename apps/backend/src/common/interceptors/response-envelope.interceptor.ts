import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';

/**
 * Wraps successful responses in the `{ "data": ... }` envelope
 * (docs/API_CONTRACT.md section 9).
 *
 * Handlers that already return a full envelope — e.g. paginated results
 * shaped as `{ data, meta }` — are passed through untouched.
 */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((payload) => {
        if (payload === undefined || payload === null) {
          return payload;
        }
        if (isAlreadyEnveloped(payload)) {
          return payload;
        }
        return { data: payload };
      }),
    );
  }
}

function isAlreadyEnveloped(payload: unknown): boolean {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    !Array.isArray(payload) &&
    ('data' in payload || 'error' in payload)
  );
}
