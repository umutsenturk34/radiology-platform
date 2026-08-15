import { Injectable } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import { UserRole, UserStatus } from '@radiology/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AppLogger } from '../common/logging/app-logger.service';
import {
  InvalidCredentialsException,
  UnauthorizedAppException,
  UserInactiveException,
  UserSuspendedException,
} from '../common/errors/app.exception';
import { TokenService } from './token.service';
import type {
  AuthUserDto,
  AuthenticatedUser,
  CurrentUserDto,
  IssuedTokens,
  LoginResult,
  RequestMetadata,
} from './auth.types';

/** Longest user-agent string persisted on a session row. */
const MAX_USER_AGENT_LENGTH = 512;

/**
 * Authentication and session lifecycle (TASK_QUEUE BACKEND-006).
 *
 * Responsibilities:
 *   - verify credentials without revealing whether an account exists
 *   - issue a short-lived access token plus a rotating refresh session
 *   - resolve the authenticated principal for every guarded request
 *
 * Passwords and refresh tokens are never logged (CLAUDE.md section 42).
 */
@Injectable()
export class AuthService {
  private readonly logger: AppLogger;

  /**
   * Argon2 hash of a random value, used to spend the same CPU time when the
   * email does not exist. Without it, response time alone tells an attacker
   * which addresses are registered.
   */
  private decoyHashPromise?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    logger: AppLogger,
  ) {
    this.logger = logger.child(AuthService.name);
  }

  async login(
    credentials: { email: string; password: string },
    metadata: RequestMetadata = {},
  ): Promise<LoginResult> {
    const email = credentials.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      await this.spendDecoyVerification(credentials.password);
      this.logger.warn({ message: 'Login rejected', reason: 'unknown_email' });
      throw new InvalidCredentialsException();
    }

    const passwordMatches = await this.verifyPassword(user.passwordHash, credentials.password);
    if (!passwordMatches) {
      this.logger.warn({ message: 'Login rejected', reason: 'bad_password', userId: user.id });
      throw new InvalidCredentialsException();
    }

    // Status is only checked after the password matched: reporting "inactive"
    // to an unauthenticated caller would confirm the account exists.
    this.assertUserIsActive(user.status as UserStatus);

    const tokens = await this.issueSession(
      { id: user.id, role: user.role as UserRole },
      metadata,
    );

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    this.logger.info({ message: 'Login succeeded', userId: user.id, role: user.role });

    return { ...tokens, user: toAuthUser(user) };
  }

  /**
   * Exchanges a refresh token for a new token pair.
   *
   * The old session is always revoked (rotation), so a stolen refresh token is
   * usable at most once. Presenting an already-revoked token is treated as
   * theft and revokes every session the user has.
   *
   * Consequence for clients: rotation starts a new session, and the access
   * token issued by the previous one stops working immediately. A client must
   * therefore use the token returned here for subsequent requests rather than
   * keeping the old one alive until its `exp`.
   */
  async refresh(refreshToken: string | undefined, metadata: RequestMetadata = {}): Promise<IssuedTokens> {
    if (!refreshToken) {
      throw new UnauthorizedAppException('Refresh token is missing.');
    }

    const payload = this.tokenService.verifyRefreshToken(refreshToken);
    const refreshTokenHash = this.tokenService.hashRefreshToken(refreshToken);

    const session = await this.prisma.userSession.findUnique({
      where: { refreshTokenHash },
      include: { user: true },
    });

    if (!session || session.id !== payload.sid || session.userId !== payload.sub) {
      throw new UnauthorizedAppException('Refresh session is not valid.');
    }

    if (session.revokedAt) {
      // A revoked token being replayed means the value leaked. Drop every
      // active session for that user rather than only refusing this one.
      await this.revokeAllSessions(session.userId, 'refresh_token_reuse');
      this.logger.warn({
        message: 'Refresh rejected',
        reason: 'reused_revoked_token',
        userId: session.userId,
      });
      throw new UnauthorizedAppException('Refresh session is not valid.');
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedAppException('Refresh session has expired.');
    }

    this.assertUserIsActive(session.user.status as UserStatus);

    const now = new Date();
    const sessionId = randomUUID();
    const newRefreshToken = this.tokenService.signRefreshToken({
      userId: session.userId,
      sessionId,
    });

    await this.prisma.$transaction([
      this.prisma.userSession.update({
        where: { id: session.id },
        data: { revokedAt: now },
      }),
      this.prisma.userSession.create({
        data: {
          id: sessionId,
          userId: session.userId,
          refreshTokenHash: this.tokenService.hashRefreshToken(newRefreshToken),
          expiresAt: this.refreshExpiryFrom(now),
          ipAddress: metadata.ipAddress,
          userAgent: truncateUserAgent(metadata.userAgent),
        },
      }),
    ]);

    const accessToken = this.tokenService.signAccessToken({
      userId: session.userId,
      sessionId,
      role: session.user.role as UserRole,
    });

    this.logger.info({ message: 'Session refreshed', userId: session.userId });

    return {
      accessToken,
      expiresIn: this.tokenService.accessTtlSeconds,
      refreshToken: newRefreshToken,
      refreshExpiresIn: this.tokenService.refreshTtlSeconds,
    };
  }

  /**
   * Revokes the session behind the supplied refresh token.
   *
   * Always resolves: logout must clear client state even when the cookie is
   * already stale, so it never reports an error the user cannot act on.
   */
  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;

    const refreshTokenHash = this.tokenService.hashRefreshToken(refreshToken);
    const result = await this.prisma.userSession.updateMany({
      where: { refreshTokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (result.count > 0) {
      this.logger.info({ message: 'Session revoked by logout' });
    }
  }

  /** `GET /api/v1/auth/me` (docs/API_CONTRACT.md section 21). */
  async getCurrentUser(userId: string): Promise<CurrentUserDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { hospitalAccess: { include: { hospital: true } } },
    });

    if (!user) {
      throw new UnauthorizedAppException('Authentication is required.');
    }

    this.assertUserIsActive(user.status as UserStatus);

    return {
      ...toAuthUser(user),
      hospitals: user.hospitalAccess.map((access) => ({
        id: access.hospital.id,
        code: access.hospital.code,
        name: access.hospital.name,
      })),
    };
  }

  /**
   * Resolves the principal for a verified access token.
   *
   * The session and the user row are read on every request, so both a logout
   * and a deactivated account take effect at the next call rather than when the
   * short-lived token happens to expire
   * (docs/AUTH_ROLES_PERMISSIONS.md sections 83 and 84).
   */
  async resolveAuthenticatedUser(userId: string, sessionId: string): Promise<AuthenticatedUser> {
    const session = await this.prisma.userSession.findUnique({
      where: { id: sessionId },
      include: { user: { include: { hospitalAccess: { select: { hospitalId: true } } } } },
    });

    if (!session || session.userId !== userId) {
      throw new UnauthorizedAppException('Authentication is required.');
    }

    if (session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedAppException('Session is no longer valid.');
    }

    const user = session.user;
    if (user.status !== UserStatus.ACTIVE) {
      // Guards must fail closed for a disabled account, regardless of which
      // non-active status it carries.
      throw new UnauthorizedAppException('This account is no longer active.');
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role as UserRole,
      status: user.status as UserStatus,
      sessionId,
      hospitalIds: user.hospitalAccess.map((access) => access.hospitalId),
    };
  }

  private async issueSession(
    user: { id: string; role: UserRole },
    metadata: RequestMetadata,
  ): Promise<IssuedTokens> {
    const now = new Date();
    const sessionId = randomUUID();

    const refreshToken = this.tokenService.signRefreshToken({ userId: user.id, sessionId });

    await this.prisma.userSession.create({
      data: {
        id: sessionId,
        userId: user.id,
        refreshTokenHash: this.tokenService.hashRefreshToken(refreshToken),
        expiresAt: this.refreshExpiryFrom(now),
        ipAddress: metadata.ipAddress,
        userAgent: truncateUserAgent(metadata.userAgent),
      },
    });

    const accessToken = this.tokenService.signAccessToken({
      userId: user.id,
      sessionId,
      role: user.role,
    });

    return {
      accessToken,
      expiresIn: this.tokenService.accessTtlSeconds,
      refreshToken,
      refreshExpiresIn: this.tokenService.refreshTtlSeconds,
    };
  }

  private async revokeAllSessions(userId: string, reason: string): Promise<void> {
    const result = await this.prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    this.logger.warn({ message: 'All sessions revoked', userId, reason, count: result.count });
  }

  private assertUserIsActive(status: UserStatus): void {
    if (status === UserStatus.SUSPENDED) throw new UserSuspendedException();
    if (status !== UserStatus.ACTIVE) throw new UserInactiveException();
  }

  private refreshExpiryFrom(now: Date): Date {
    return new Date(now.getTime() + this.tokenService.refreshTtlSeconds * 1000);
  }

  private async verifyPassword(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await argonVerify(passwordHash, password);
    } catch {
      // A malformed stored hash must not authenticate anyone.
      return false;
    }
  }

  private async spendDecoyVerification(password: string): Promise<void> {
    this.decoyHashPromise ??= argonHash(randomBytes(32).toString('hex'));
    await this.verifyPassword(await this.decoyHashPromise, password);
  }
}

function toAuthUser(user: {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
}): AuthUserDto {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role as UserRole,
    status: user.status as UserStatus,
  };
}

function truncateUserAgent(userAgent: string | undefined): string | undefined {
  if (!userAgent) return undefined;
  return userAgent.slice(0, MAX_USER_AGENT_LENGTH);
}
