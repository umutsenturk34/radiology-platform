/**
 * Auth constants shared by the controller, service and guards.
 *
 * Source: docs/API_CONTRACT.md sections 6, 8, 17-21 and
 * docs/BACKEND.md sections 21-25.
 */

/** Name of the HttpOnly refresh cookie. */
export const REFRESH_COOKIE_NAME = 'radiology_refresh_token';

/**
 * Cookie path. Scoping it to the auth routes keeps the refresh token off every
 * other request, so a leak in an unrelated endpoint cannot expose it.
 */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

/** `typ` claim values, so an access token can never be used as a refresh token. */
export const TOKEN_TYPE = {
  ACCESS: 'access',
  REFRESH: 'refresh',
} as const;

export type TokenType = (typeof TOKEN_TYPE)[keyof typeof TOKEN_TYPE];
