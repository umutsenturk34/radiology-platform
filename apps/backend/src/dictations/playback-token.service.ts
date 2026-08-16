import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { UnauthorizedAppException } from '../common/errors/app.exception';
import type { JwtConfig } from '../config/configuration';

/**
 * Short-lived tokens for the audio streaming route.
 *
 * A browser `<audio>` element cannot send an Authorization header, so playback
 * needs a URL that carries its own authority. The token is bound to one
 * dictation and one user and expires quickly, which keeps the object
 * effectively non-public (docs/API_CONTRACT.md section 42).
 */
@Injectable()
export class PlaybackTokenService {
  private readonly secret: string;

  constructor(config: ConfigService) {
    const jwt = config.get<JwtConfig>('app.jwt');
    if (!jwt) {
      throw new Error('JWT configuration is missing; playback tokens cannot be signed.');
    }
    // Derived from the access-token secret so there is no third secret to
    // rotate, but namespaced so a playback token is never a valid access token.
    this.secret = `playback:${jwt.accessSecret}`;
  }

  issue(dictationId: string, userId: string, ttlSeconds: number): { token: string; expiresAt: Date } {
    const expiresAtMs = Date.now() + ttlSeconds * 1000;
    const signature = this.sign(dictationId, userId, expiresAtMs);

    return {
      token: `${expiresAtMs}.${userId}.${signature}`,
      expiresAt: new Date(expiresAtMs),
    };
  }

  /** Returns the user the token was issued to, or throws. */
  verify(token: string | undefined, dictationId: string): string {
    if (!token) {
      throw new UnauthorizedAppException('A playback token is required.');
    }

    const [expiresAtRaw, userId, signature] = token.split('.');
    const expiresAtMs = Number(expiresAtRaw);

    if (!expiresAtRaw || !userId || !signature || !Number.isFinite(expiresAtMs)) {
      throw new UnauthorizedAppException('Invalid playback token.');
    }

    if (expiresAtMs <= Date.now()) {
      throw new UnauthorizedAppException('Playback token has expired.');
    }

    const expected = this.sign(dictationId, userId, expiresAtMs);
    const provided = Buffer.from(signature);
    const wanted = Buffer.from(expected);

    // Constant-time compare, and a length check first because timingSafeEqual
    // throws on mismatched lengths.
    if (provided.length !== wanted.length || !timingSafeEqual(provided, wanted)) {
      throw new UnauthorizedAppException('Invalid playback token.');
    }

    return userId;
  }

  private sign(dictationId: string, userId: string, expiresAtMs: number): string {
    return createHmac('sha256', this.secret)
      .update(`${dictationId}:${userId}:${expiresAtMs}`)
      .digest('base64url');
  }
}
