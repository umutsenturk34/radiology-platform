import { Controller, Get, Post } from '@nestjs/common';
import { UserRole } from '@radiology/shared';
import { Roles } from '../../src/auth/decorators/roles.decorator';
import { Public } from '../../src/auth/decorators/public.decorator';
import { CurrentUser } from '../../src/auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../src/auth/auth.types';

/**
 * Test-only routes that mirror the role requirements of the endpoints the task
 * queue defines (finalize, manager users, HBYS retry), so `RolesGuard` can be
 * verified over real HTTP before those endpoints exist.
 *
 * Mounted only by the e2e testing module — never by AppModule.
 */
@Controller('probe')
export class RolesProbeController {
  /** Mirrors POST /studies/:id/finalize — DOCTOR only. */
  @Roles(UserRole.DOCTOR)
  @Post('finalize')
  finalize(@CurrentUser() user: AuthenticatedUser) {
    return { action: 'finalize', by: user.role };
  }

  /** Mirrors GET /manager/users — MANAGER only. */
  @Roles(UserRole.MANAGER)
  @Get('manager/users')
  managerUsers(@CurrentUser() user: AuthenticatedUser) {
    return { action: 'manager-users', by: user.role };
  }

  /** Mirrors POST /hbys-deliveries/:id/retry — OPERATION or MANAGER. */
  @Roles(UserRole.OPERATION, UserRole.MANAGER)
  @Post('hbys-retry')
  hbysRetry(@CurrentUser() user: AuthenticatedUser) {
    return { action: 'hbys-retry', by: user.role };
  }

  /** Authenticated but unrestricted, e.g. a study list any role may read. */
  @Get('any-role')
  anyRole(@CurrentUser() user: AuthenticatedUser) {
    return { action: 'any-role', by: user.role };
  }

  @Public()
  @Get('public')
  publicRoute() {
    return { action: 'public' };
  }
}
