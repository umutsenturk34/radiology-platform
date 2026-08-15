import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import {
  UnauthorizedAppException,
  ValidationAppException,
} from '../../common/errors/app.exception';
import { AppLogger } from '../../common/logging/app-logger.service';
import { HospitalScopeService } from '../hospital-scope.service';
import type { AuthenticatedUser } from '../auth.types';

/** Request locations searched for the hospital id, in order. */
const HOSPITAL_ID_FIELD = 'hospitalId';

/**
 * Guards routes that name a hospital directly in the request — a route param,
 * a query filter or a body field (TASK_QUEUE BACKEND-008).
 *
 * Applied with `@UseGuards(HospitalAccessGuard)`, not globally: most endpoints
 * identify the hospital through the resource they load (a Study, a Report),
 * which the service layer scopes with `HospitalScopeService` after reading it.
 */
@Injectable()
export class HospitalAccessGuard implements CanActivate {
  private readonly logger: AppLogger;

  constructor(
    private readonly hospitalScope: HospitalScopeService,
    logger: AppLogger,
  ) {
    this.logger = logger.child(HospitalAccessGuard.name);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedAppException('Authentication is required.');
    }

    const hospitalId = extractHospitalId(request);
    if (!hospitalId) {
      // The route asked for a hospital check but the request carries no
      // hospital, so there is nothing to authorize against. Refuse instead of
      // letting an unscoped request through.
      throw new ValidationAppException({ [HOSPITAL_ID_FIELD]: ['hospitalId is required.'] });
    }

    if (!this.hospitalScope.isAllowed(user, hospitalId)) {
      this.logger.warn({
        message: 'Hospital access denied',
        userId: user.id,
        role: user.role,
        hospitalId,
        path: request.url,
      });
    }

    this.hospitalScope.assertAllowed(user, hospitalId);

    return true;
  }
}

function extractHospitalId(request: Request): string | undefined {
  const sources: Array<Record<string, unknown> | undefined> = [
    request.params as Record<string, unknown> | undefined,
    request.query as Record<string, unknown> | undefined,
    request.body as Record<string, unknown> | undefined,
  ];

  for (const source of sources) {
    const value = source?.[HOSPITAL_ID_FIELD];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }

  return undefined;
}
