import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'auth:isPublic';

/**
 * Marks a route as reachable without authentication.
 *
 * `JwtAuthGuard` is registered globally so the default is deny
 * (docs/AUTH_ROLES_PERMISSIONS.md section 85); this decorator is the only way
 * to opt a route out, which keeps the public surface explicit and greppable.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
