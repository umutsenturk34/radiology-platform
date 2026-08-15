import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';
import type { UserRole } from '@radiology/shared';
import type { JwtConfig } from '../config/configuration';
import { TOKEN_TYPE } from './auth.constants';
import type { AccessTokenPayload, RefreshTokenPayload } from './auth.types';
import { UnauthorizedAppException } from '../common/errors/app.exception';

/**
 * Signs and verifies the two token types.
 *
 * Access and refresh tokens use separate secrets, so a leak of one does not
 * grant the other (docs/BACKEND.md sections 23 and 24).
 */
@Injectable()
export class TokenService {
  private readonly jwtConfig: JwtConfig;

  constructor(
    private readonly jwtService: JwtService,
    config: ConfigService,
  ) {
    const jwtConfig = config.get<JwtConfig>('app.jwt');
    if (!jwtConfig) {
      throw new Error('JWT configuration is missing; the application cannot issue tokens.');
    }
    this.jwtConfig = jwtConfig;
  }

  get accessTtlSeconds(): number {
    return this.jwtConfig.accessTtlSeconds;
  }

  get refreshTtlSeconds(): number {
    return this.jwtConfig.refreshTtlSeconds;
  }

  signAccessToken(input: { userId: string; sessionId: string; role: UserRole }): string {
    return this.jwtService.sign(
      { sub: input.userId, sid: input.sessionId, role: input.role, typ: TOKEN_TYPE.ACCESS },
      { secret: this.jwtConfig.accessSecret, expiresIn: this.jwtConfig.accessTtlSeconds },
    );
  }

  signRefreshToken(input: { userId: string; sessionId: string }): string {
    return this.jwtService.sign(
      { sub: input.userId, sid: input.sessionId, typ: TOKEN_TYPE.REFRESH },
      { secret: this.jwtConfig.refreshSecret, expiresIn: this.jwtConfig.refreshTtlSeconds },
    );
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    const payload = this.verify<AccessTokenPayload>(token, this.jwtConfig.accessSecret);
    if (payload.typ !== TOKEN_TYPE.ACCESS) {
      throw new UnauthorizedAppException('Invalid access token.');
    }
    return payload;
  }

  verifyRefreshToken(token: string): RefreshTokenPayload {
    const payload = this.verify<RefreshTokenPayload>(token, this.jwtConfig.refreshSecret);
    if (payload.typ !== TOKEN_TYPE.REFRESH) {
      throw new UnauthorizedAppException('Invalid refresh token.');
    }
    return payload;
  }

  /**
   * Deterministic hash stored in `UserSession.refreshTokenHash`.
   *
   * SHA-256 (not argon2) because the row has to be looked up by hash on every
   * refresh. That is safe here: the token is a signed, high-entropy value, not
   * a user-chosen password. The plain token is never persisted
   * (docs/BACKEND.md section 24).
   */
  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private verify<T extends object>(token: string, secret: string): T {
    try {
      return this.jwtService.verify<T>(token, { secret });
    } catch {
      // Never surface the underlying jsonwebtoken message: it distinguishes
      // "expired" from "malformed" from "bad signature".
      throw new UnauthorizedAppException('Invalid or expired token.');
    }
  }
}
