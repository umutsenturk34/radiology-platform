import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiErrorCode } from '@radiology/shared';
import { AppException } from '../common/errors/app.exception';
import { AppLogger } from '../common/logging/app-logger.service';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';

/** 403 — the pilot dev tools are switched off for this environment. */
export class DevToolsDisabledException extends AppException {
  constructor() {
    super(
      ApiErrorCode.DEV_TOOLS_DISABLED,
      'Development tools are disabled in this environment.',
      HttpStatus.FORBIDDEN,
    );
  }
}

/**
 * Environment gate for the dev-tools routes (TASK_QUEUE BACKEND-050,
 * docs/API_CONTRACT.md section 93).
 *
 * Two independent conditions must both hold: `DEV_TOOLS_ENABLED=true` and the
 * MANAGER role (enforced separately by `@Roles`). The flag is checked per
 * request rather than at registration time so the refusal is explicit and
 * auditable instead of looking like a missing route.
 */
@Injectable()
export class DevToolsGuard implements CanActivate {
  private readonly logger: AppLogger;

  constructor(
    private readonly config: ConfigService,
    logger: AppLogger,
  ) {
    this.logger = logger.child(DevToolsGuard.name);
  }

  canActivate(context: ExecutionContext): boolean {
    const enabled = this.config.get<boolean>('app.devToolsEnabled') ?? false;

    if (!enabled) {
      const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
      this.logger.warn({
        message: 'Dev tools request refused',
        reason: 'DEV_TOOLS_ENABLED is false',
        path: request.url,
        userId: request.user?.id,
      });
      throw new DevToolsDisabledException();
    }

    return true;
  }
}
