import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@radiology/shared';

export const ROLES_KEY = 'auth:roles';

/**
 * Restricts a route to the listed roles (docs/AUTH_ROLES_PERMISSIONS.md 95).
 *
 * This is the coarse layer only. Anything touching a specific Study also needs
 * hospital scope, assignment, workflow state and lock ownership checks — a role
 * alone never authorizes a clinical action.
 */
export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
