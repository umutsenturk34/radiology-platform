import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { UnauthorizedAppException } from '../../common/errors/app.exception';
import type { AuthenticatedUser } from '../auth.types';

/**
 * Injects the principal attached by `JwtAuthGuard`.
 *
 * Throws rather than returning `undefined` when the route is public: a handler
 * asking for the current user on an unauthenticated route is a wiring mistake,
 * and silently passing `undefined` would push the failure into business logic.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    if (!request.user) {
      throw new UnauthorizedAppException('Authentication is required.');
    }
    return request.user;
  },
);
