import type { ExecutionContext } from '@nestjs/common';
import { UserRole, UserStatus } from '@radiology/shared';
import { HospitalAccessGuard } from './hospital-access.guard';
import { HospitalScopeService } from '../hospital-scope.service';
import { AppLogger } from '../../common/logging/app-logger.service';
import { AppException } from '../../common/errors/app.exception';
import type { AuthenticatedUser } from '../auth.types';

const HOSPITAL_A = 'hospital-a';
const HOSPITAL_B = 'hospital-b';

function principal(role: UserRole, hospitalIds: string[]): AuthenticatedUser {
  return {
    id: 'user-1',
    email: 'user@test.local',
    role,
    status: UserStatus.ACTIVE,
    sessionId: 'session-1',
    hospitalIds,
  };
}

function createContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ url: '/api/v1/example', ...request }) }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

const guard = new HospitalAccessGuard(new HospitalScopeService(), new AppLogger('error'));

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

describe('HospitalAccessGuard', () => {
  const doctor = principal(UserRole.DOCTOR, [HOSPITAL_A]);

  it.each([
    ['a route param', { params: { hospitalId: HOSPITAL_A } }],
    ['a query parameter', { query: { hospitalId: HOSPITAL_A } }],
    ['a body field', { body: { hospitalId: HOSPITAL_A } }],
  ])('accepts an authorized hospital supplied through %s', (_label, source) => {
    expect(guard.canActivate(createContext({ user: doctor, ...source }))).toBe(true);
  });

  it.each([
    ['a route param', { params: { hospitalId: HOSPITAL_B } }],
    ['a query parameter', { query: { hospitalId: HOSPITAL_B } }],
    ['a body field', { body: { hospitalId: HOSPITAL_B } }],
  ])('refuses an unauthorized hospital supplied through %s', (_label, source) => {
    expectDenied(
      () => guard.canActivate(createContext({ user: doctor, ...source })),
      'HOSPITAL_ACCESS_DENIED',
      403,
    );
  });

  it('prefers the route param over a body field, so the body cannot widen the check', () => {
    expectDenied(
      () =>
        guard.canActivate(
          createContext({
            user: doctor,
            params: { hospitalId: HOSPITAL_B },
            body: { hospitalId: HOSPITAL_A },
          }),
        ),
      'HOSPITAL_ACCESS_DENIED',
      403,
    );
  });

  it('lets a Manager through for any hospital', () => {
    const manager = principal(UserRole.MANAGER, []);

    expect(
      guard.canActivate(createContext({ user: manager, params: { hospitalId: HOSPITAL_B } })),
    ).toBe(true);
  });

  it('refuses when no principal is attached', () => {
    expectDenied(
      () => guard.canActivate(createContext({ params: { hospitalId: HOSPITAL_A } })),
      'UNAUTHORIZED',
      401,
    );
  });

  it.each([
    ['nothing', {}],
    ['an empty string', { params: { hospitalId: '   ' } }],
    ['a non-string value', { query: { hospitalId: ['a', 'b'] } }],
  ])('refuses a request carrying %s instead of running unscoped', (_label, source) => {
    expectDenied(
      () => guard.canActivate(createContext({ user: doctor, ...source })),
      'VALIDATION_ERROR',
      422,
    );
  });
});
