import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { UnauthorizedAppException } from '../../common/errors/app.exception';
import { setRequestPrincipal } from '../../common/logging/request-context';
import { AuthService } from '../auth.service';
import { TokenService } from '../token.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthenticatedUser } from '../auth.types';

/**
 * Verifies the `Authorization: Bearer <access-token>` header and attaches the
 * principal to the request (docs/API_CONTRACT.md section 6).
 *
 * Registered globally, so any route without `@Public()` requires a valid token
 * — the backend is the security boundary, not the frontend
 * (CLAUDE.md section 38).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokenService: TokenService,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const token = extractBearerToken(request.headers.authorization);

    if (!token) {
      throw new UnauthorizedAppException('Authentication is required.');
    }

    const payload = this.tokenService.verifyAccessToken(token);
    const user = await this.authService.resolveAuthenticatedUser(payload.sub, payload.sid);

    request.user = user;
    setRequestPrincipal(user.id, user.role);

    return true;
  }
}

function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;

  const [scheme, value] = header.split(' ');
  if (!value || scheme.toLowerCase() !== 'bearer') return null;

  const token = value.trim();
  return token.length > 0 ? token : null;
}
