import { Injectable } from '@nestjs/common';
import { UserRole } from '@radiology/shared';
import { HospitalAccessDeniedException } from '../common/errors/app.exception';
import type { AuthenticatedUser } from './auth.types';

/** Prisma where-fragment restricting a query to the hospitals a user may see. */
export type HospitalScopeFilter = Record<string, never> | { hospitalId: string | { in: string[] } };

/**
 * Hospital scope (TASK_QUEUE BACKEND-008).
 *
 * Every study read or mutation is scoped through `UserHospitalAccess`
 * (docs/AUTH_ROLES_PERMISSIONS.md sections 5, 18 and 32). Knowing a Study UUID
 * is never enough: the hospital owning it must also be authorized.
 *
 * Manager is the one documented exception — the pilot default is
 * "Manager = all hospitals" (section 46). No other role, Operation included,
 * ever gets implicit access to every hospital.
 */
@Injectable()
export class HospitalScopeService {
  /** True when the role is authorized for every hospital. */
  hasFullAccess(user: Pick<AuthenticatedUser, 'role'>): boolean {
    return user.role === UserRole.MANAGER;
  }

  isAllowed(user: Pick<AuthenticatedUser, 'role' | 'hospitalIds'>, hospitalId: string): boolean {
    if (this.hasFullAccess(user)) return true;
    return user.hospitalIds.includes(hospitalId);
  }

  /** Throws `403 HOSPITAL_ACCESS_DENIED` when the hospital is out of scope. */
  assertAllowed(user: Pick<AuthenticatedUser, 'role' | 'hospitalIds'>, hospitalId: string): void {
    if (!this.isAllowed(user, hospitalId)) {
      throw new HospitalAccessDeniedException();
    }
  }

  /**
   * Builds the hospital restriction for a list query.
   *
   * A user with no hospital access gets `{ in: [] }` rather than an unfiltered
   * query, so the failure mode is an empty list, never a data leak.
   */
  buildFilter(
    user: Pick<AuthenticatedUser, 'role' | 'hospitalIds'>,
    requestedHospitalId?: string,
  ): HospitalScopeFilter {
    if (requestedHospitalId) {
      // Filtering by a hospital the user cannot see is refused rather than
      // silently returning nothing, so the client learns it asked for
      // something it is not allowed to see.
      this.assertAllowed(user, requestedHospitalId);
      return { hospitalId: requestedHospitalId };
    }

    if (this.hasFullAccess(user)) {
      return {};
    }

    return { hospitalId: { in: user.hospitalIds } };
  }
}
