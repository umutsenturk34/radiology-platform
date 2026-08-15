import type { UserRole, UserStatus } from '@radiology/shared';
import type { TokenType } from './auth.constants';

/** Claims carried by an access token. */
export interface AccessTokenPayload {
  /** User id. */
  sub: string;
  /** Session id, so a token can be traced back to the session that issued it. */
  sid: string;
  role: UserRole;
  typ: TokenType;
  iat?: number;
  exp?: number;
}

/** Claims carried by a refresh token. */
export interface RefreshTokenPayload {
  sub: string;
  sid: string;
  typ: TokenType;
  iat?: number;
  exp?: number;
}

/**
 * The authenticated principal attached to a request by `JwtAuthGuard`.
 *
 * `hospitalIds` is resolved on every request so hospital scope checks
 * (BACKEND-008) never have to trust a value carried inside the token.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  sessionId: string;
  hospitalIds: string[];
}

/** Metadata recorded on a session (docs/BACKEND.md section 25). */
export interface RequestMetadata {
  ipAddress?: string;
  userAgent?: string;
}

/** Public user shape returned by login and `/auth/me`. Never includes hashes. */
export interface AuthUserDto {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: UserStatus;
}

export interface AuthHospitalDto {
  id: string;
  code: string;
  name: string;
}

export interface CurrentUserDto extends AuthUserDto {
  hospitals: AuthHospitalDto[];
}

/** Value returned by login/refresh, before the cookie is applied. */
export interface IssuedTokens {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresIn: number;
}

export interface LoginResult extends IssuedTokens {
  user: AuthUserDto;
}
