import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

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
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthService, TokenService],
})
export class AuthModule {}
