import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { HospitalAccessGuard } from './guards/hospital-access.guard';
import { HospitalScopeService } from './hospital-scope.service';

/**
 * Authentication and role authorization (TASK_QUEUE BACKEND-006, BACKEND-007).
 *
 * Both guards are global so every route is protected unless it opts out with
 * `@Public()`. Registration order matters: `JwtAuthGuard` must run first so
 * `RolesGuard` can read the principal it attaches. Secrets and TTLs are passed
 * per sign/verify call by `TokenService`, which is why `JwtModule` is
 * registered empty.
 */
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    HospitalScopeService,
    // Not global: it applies only to routes that name a hospital in the
    // request. Resource-driven scoping goes through HospitalScopeService.
    HospitalAccessGuard,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthService, TokenService, HospitalScopeService, HospitalAccessGuard],
})
export class AuthModule {}
