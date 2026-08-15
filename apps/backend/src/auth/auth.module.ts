import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

/**
 * Authentication module (TASK_QUEUE BACKEND-006).
 *
 * `JwtAuthGuard` is registered as a global guard so every route is protected
 * unless it opts out with `@Public()`. Secrets and TTLs are passed per sign/
 * verify call by `TokenService`, which is why `JwtModule` is registered empty.
 */
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [AuthService, TokenService],
})
export class AuthModule {}
