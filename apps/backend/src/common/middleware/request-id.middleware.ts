import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { REQUEST_ID_HEADER } from '@radiology/shared';
import { runWithRequestContext } from '../logging/request-context';

/** Upper bound on an accepted client-supplied request id. */
const MAX_REQUEST_ID_LENGTH = 128;
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]+$/;

/**
 * Assigns a correlation id to every request and echoes it back
 * (docs/API_CONTRACT.md section 115).
 *
 * A client-supplied id is reused only when it is short and free of control
 * characters, so it cannot be used to inject content into logs or headers.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = resolveRequestId(req.headers[REQUEST_ID_HEADER]);
    res.setHeader(REQUEST_ID_HEADER, requestId);
    runWithRequestContext({ requestId }, () => next());
  }
}

function resolveRequestId(header: string | string[] | undefined): string {
  const candidate = Array.isArray(header) ? header[0] : header;
  if (
    typeof candidate === 'string' &&
    candidate.length > 0 &&
    candidate.length <= MAX_REQUEST_ID_LENGTH &&
    SAFE_REQUEST_ID.test(candidate)
  ) {
    return candidate;
  }
  return randomUUID();
}
