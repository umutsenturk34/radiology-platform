import { UserRole, UserStatus } from '@radiology/shared';
import { HospitalScopeService } from './hospital-scope.service';
import { AppException } from '../common/errors/app.exception';
import type { AuthenticatedUser } from './auth.types';

const HOSPITAL_A = 'hospital-a';
const HOSPITAL_B = 'hospital-b';
const HOSPITAL_C = 'hospital-c';

function principal(role: UserRole, hospitalIds: string[]): AuthenticatedUser {
  return {
    id: `user-${role.toLowerCase()}`,
    email: `${role.toLowerCase()}@test.local`,
    role,
    status: UserStatus.ACTIVE,
    sessionId: 'session-1',
    hospitalIds,
  };
}

function expectDenied(fn: () => unknown): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).code).toBe('HOSPITAL_ACCESS_DENIED');
    expect((error as AppException).getStatus()).toBe(403);
    return;
  }
  throw new Error('Expected HOSPITAL_ACCESS_DENIED');
}

describe('HospitalScopeService', () => {
  const service = new HospitalScopeService();

  describe('isAllowed', () => {
    it.each([UserRole.DOCTOR, UserRole.REPORTER, UserRole.OPERATION])(
      'limits a %s to its granted hospitals',
      (role) => {
        const user = principal(role, [HOSPITAL_A, HOSPITAL_B]);

        expect(service.isAllowed(user, HOSPITAL_A)).toBe(true);
        expect(service.isAllowed(user, HOSPITAL_B)).toBe(true);
        expect(service.isAllowed(user, HOSPITAL_C)).toBe(false);
      },
    );

    it('gives a Manager every hospital, as the pilot default requires', () => {
      // docs/AUTH_ROLES_PERMISSIONS.md section 46: Manager = all hospitals.
      const manager = principal(UserRole.MANAGER, []);

      expect(service.hasFullAccess(manager)).toBe(true);
      expect(service.isAllowed(manager, HOSPITAL_C)).toBe(true);
    });

    it('does not give Operation implicit access to every hospital', () => {
      // Section 32: no role except Manager sees all hospitals automatically.
      const operation = principal(UserRole.OPERATION, [HOSPITAL_A]);

      expect(service.hasFullAccess(operation)).toBe(false);
      expect(service.isAllowed(operation, HOSPITAL_B)).toBe(false);
    });

    it('denies everything to a user with no hospital access', () => {
      const doctor = principal(UserRole.DOCTOR, []);

      expect(service.isAllowed(doctor, HOSPITAL_A)).toBe(false);
    });
  });

  describe('assertAllowed', () => {
    it('passes for an authorized hospital', () => {
      const doctor = principal(UserRole.DOCTOR, [HOSPITAL_A]);

      expect(() => service.assertAllowed(doctor, HOSPITAL_A)).not.toThrow();
    });

    it('throws HOSPITAL_ACCESS_DENIED for an unauthorized hospital', () => {
      const doctor = principal(UserRole.DOCTOR, [HOSPITAL_A]);

      expectDenied(() => service.assertAllowed(doctor, HOSPITAL_B));
    });
  });

  describe('buildFilter', () => {
    it('restricts a scoped user to its hospitals', () => {
      const doctor = principal(UserRole.DOCTOR, [HOSPITAL_A, HOSPITAL_B]);

      expect(service.buildFilter(doctor)).toEqual({
        hospitalId: { in: [HOSPITAL_A, HOSPITAL_B] },
      });
    });

    it('returns an impossible filter, not an open one, when the user has no access', () => {
      const doctor = principal(UserRole.DOCTOR, []);

      expect(service.buildFilter(doctor)).toEqual({ hospitalId: { in: [] } });
    });

    it('leaves a Manager query unrestricted', () => {
      expect(service.buildFilter(principal(UserRole.MANAGER, []))).toEqual({});
    });

    it('narrows to an explicitly requested hospital the user may see', () => {
      const doctor = principal(UserRole.DOCTOR, [HOSPITAL_A, HOSPITAL_B]);

      expect(service.buildFilter(doctor, HOSPITAL_B)).toEqual({ hospitalId: HOSPITAL_B });
    });

    it('refuses a requested hospital outside the scope instead of returning nothing', () => {
      const doctor = principal(UserRole.DOCTOR, [HOSPITAL_A]);

      expectDenied(() => service.buildFilter(doctor, HOSPITAL_B));
    });

    it('lets a Manager filter by any hospital', () => {
      expect(service.buildFilter(principal(UserRole.MANAGER, []), HOSPITAL_C)).toEqual({
        hospitalId: HOSPITAL_C,
      });
    });
  });
});
