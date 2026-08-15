import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { UserRole } from '@radiology/shared';
import { ForbiddenAppException, UnauthorizedAppException } from '../../common/errors/app.exception';
import { AppLogger } from '../../common/logging/app-logger.service';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthenticatedUser } from '../auth.types';

/**
 * Enforces `@Roles(...)` (TASK_QUEUE BACKEND-007).
 *
 * Runs after `JwtAuthGuard`, so the principal is already on the request. A
 * route without `@Roles` is left to its own finer-grained checks; a route with
 * `@Roles` is refused for every other role, whatever the frontend shows
 * (CLAUDE.md section 38).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger: AppLogger;

  constructor(
    private readonly reflector: Reflector,
    logger: AppLogger,
  ) {
    this.logger = logger.child(RolesGuard.name);
  }

  canActivate(context: ExecutionContext): boolean {
    const allowedRoles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!allowedRoles || allowedRoles.length === 0) {
      return true;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      // A public route with a role requirement is a contradiction; refusing is
      // the fail-closed reading of it.
      throw new ForbiddenAppException('This action requires an authenticated role.');
    }

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedAppException('Authentication is required.');
    }

    if (!allowedRoles.includes(user.role)) {
      this.logger.warn({
        message: 'Role check failed',
        userId: user.id,
        role: user.role,
        requiredRoles: allowedRoles,
        path: request.url,
      });
      throw new ForbiddenAppException();
    }

    return true;
  }
}
