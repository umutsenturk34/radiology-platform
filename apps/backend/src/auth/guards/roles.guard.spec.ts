import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { UserRole, UserStatus } from '@radiology/shared';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AppLogger } from '../../common/logging/app-logger.service';
import { AppException } from '../../common/errors/app.exception';
import type { AuthenticatedUser } from '../auth.types';

function principal(role: UserRole): AuthenticatedUser {
  return {
    id: `user-${role.toLowerCase()}`,
    email: `${role.toLowerCase()}@test.local`,
    role,
    status: UserStatus.ACTIVE,
    sessionId: 'session-1',
    hospitalIds: ['hospital-1'],
  };
}

function createContext(user?: AuthenticatedUser): ExecutionContext {
  const request = { url: '/api/v1/example', user };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

/** Reflector stub returning fixed metadata for the two keys the guard reads. */
function createReflector(metadata: { roles?: UserRole[]; isPublic?: boolean }): Reflector {
  return {
    getAllAndOverride: (key: string) => {
      if (key === ROLES_KEY) return metadata.roles;
      if (key === IS_PUBLIC_KEY) return metadata.isPublic;
      return undefined;
    },
  } as unknown as Reflector;
}

function createGuard(metadata: { roles?: UserRole[]; isPublic?: boolean }): RolesGuard {
  return new RolesGuard(createReflector(metadata), new AppLogger('error'));
}

/** Asserts the guard threw an AppException carrying the expected code. */
function expectDenied(fn: () => unknown, code: string, status: number): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).code).toBe(code);
    expect((error as AppException).getStatus()).toBe(status);
    return;
  }
  throw new Error(`Expected the guard to deny with ${code}`);
}

describe('RolesGuard', () => {
  it('allows a route without a role requirement', () => {
    const guard = createGuard({});

    expect(guard.canActivate(createContext(principal(UserRole.REPORTER)))).toBe(true);
  });

  it('treats an empty role list as no requirement', () => {
    const guard = createGuard({ roles: [] });

    expect(guard.canActivate(createContext(principal(UserRole.REPORTER)))).toBe(true);
  });

  it('allows a matching role', () => {
    const guard = createGuard({ roles: [UserRole.DOCTOR] });

    expect(guard.canActivate(createContext(principal(UserRole.DOCTOR)))).toBe(true);
  });

  it('allows any of several accepted roles', () => {
    const guard = createGuard({ roles: [UserRole.OPERATION, UserRole.MANAGER] });

    expect(guard.canActivate(createContext(principal(UserRole.MANAGER)))).toBe(true);
    expect(guard.canActivate(createContext(principal(UserRole.OPERATION)))).toBe(true);
  });

  it('refuses a Reporter on a Doctor-only action such as finalize', () => {
    const guard = createGuard({ roles: [UserRole.DOCTOR] });

    expectDenied(() => guard.canActivate(createContext(principal(UserRole.REPORTER))), 'FORBIDDEN', 403); // prettier-ignore
  });

  it('refuses a Doctor on a Manager-only action', () => {
    const guard = createGuard({ roles: [UserRole.MANAGER] });

    expectDenied(() => guard.canActivate(createContext(principal(UserRole.DOCTOR))), 'FORBIDDEN', 403); // prettier-ignore
  });

  it('refuses a Doctor on an Operation/Manager action such as HBYS retry', () => {
    const guard = createGuard({ roles: [UserRole.OPERATION, UserRole.MANAGER] });

    expectDenied(() => guard.canActivate(createContext(principal(UserRole.DOCTOR))), 'FORBIDDEN', 403); // prettier-ignore
  });

  it('does not grant Manager clinical authority it was not given', () => {
    // A Manager is not implicitly a Doctor (CLAUDE.md section 22).
    const guard = createGuard({ roles: [UserRole.DOCTOR] });

    expectDenied(() => guard.canActivate(createContext(principal(UserRole.MANAGER))), 'FORBIDDEN', 403); // prettier-ignore
  });

  it('refuses when no principal is attached', () => {
    const guard = createGuard({ roles: [UserRole.DOCTOR] });

    expectDenied(() => guard.canActivate(createContext(undefined)), 'UNAUTHORIZED', 401);
  });

  it('refuses a route marked both public and role-restricted', () => {
    const guard = createGuard({ roles: [UserRole.DOCTOR], isPublic: true });

    expectDenied(() => guard.canActivate(createContext(undefined)), 'FORBIDDEN', 403);
  });
});
