/**
 * Environment configuration.
 *
 * Required/optional variable names follow docs/DEPLOYMENT_PILOT.md
 * sections 23, 24 and 29.
 *
 * Rule: this file must never log or echo secret values.
 */

import { randomBytes } from 'node:crypto';

export type AppEnvironment = 'local' | 'development' | 'pilot' | 'production' | 'test';

export interface JwtConfig {
  /** HMAC secret for short-lived access tokens. */
  accessSecret: string;
  /** Separate HMAC secret for refresh tokens, so one leak is not both. */
  refreshSecret: string;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
}

export interface DatabaseConfig {
  /**
   * How long an interactive transaction may run. Prisma's 5s default is not
   * enough when the database is reached through a TCP proxy, where a single
   * round trip can cost a second.
   */
  transactionTimeoutMs: number;
  /** How long to wait for a connection before the transaction starts. */
  transactionMaxWaitMs: number;
}

export interface LockConfig {
  /** How long a study lock survives without a heartbeat. */
  ttlSeconds: number;
  /** How often the client should refresh it (advertised in responses). */
  heartbeatSeconds: number;
}

export type StorageDriver = 'local' | 's3';

export interface StorageConfig {
  driver: StorageDriver;
  /** Directory used by the local pilot driver. */
  localDir: string;
  /** Lifetime of a dictation playback URL. */
  playbackUrlTtlSeconds: number;
  /** Largest dictation upload accepted, in bytes. */
  maxUploadBytes: number;
}

export interface AppConfig {
  nodeEnv: string;
  appEnv: AppEnvironment;
  port: number;
  /** Allowed browser origins for CORS. */
  frontendUrls: string[];
  logLevel: LogLevel;
  isProduction: boolean;
  devToolsEnabled: boolean;
  allowMockIntegrations: boolean;
  database: DatabaseConfig;
  jwt: JwtConfig;
  lock: LockConfig;
  storage: StorageConfig;
  /**
   * Non-fatal configuration notes surfaced at startup. Never contains a secret
   * value — only the fact that a fallback was applied.
   */
  warnings: string[];
}

/** Access tokens must stay short-lived (docs/BACKEND.md section 23). */
const DEFAULT_ACCESS_TTL = '15m';
const DEFAULT_REFRESH_TTL = '7d';

/** Below this a shared HMAC secret is not worth calling a secret. */
const MIN_SECRET_LENGTH = 32;

const DEFAULT_TRANSACTION_TIMEOUT_MS = 15_000;
const DEFAULT_TRANSACTION_MAX_WAIT_MS = 10_000;

/** Pilot defaults from TASK_QUEUE BACKEND-015. */
const DEFAULT_LOCK_TTL_SECONDS = 60;
const DEFAULT_LOCK_HEARTBEAT_SECONDS = 20;

const DEFAULT_STORAGE_LOCAL_DIR = '.storage';
/** Short-lived on purpose: a playback URL should not be shareable for long. */
const DEFAULT_PLAYBACK_URL_TTL_SECONDS = 300;
/** 50 MB — well above a normal dictation, low enough to bound memory. */
const DEFAULT_MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

class EnvironmentError extends Error {
  constructor(problems: string[]) {
    super(`Invalid environment configuration:\n  - ${problems.join('\n  - ')}`);
    this.name = 'EnvironmentError';
  }
}

function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw.trim() === '') return fallback;
  const normalized = raw.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
  variableName: string,
  problems: string[],
): number {
  if (raw === undefined || raw.trim() === '') return fallback;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    problems.push(`${variableName} must be a positive integer, received "${raw}"`);
    return fallback;
  }

  return parsed;
}

function parseOriginList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

/**
 * Parses a duration such as `15m`, `7d`, `900s` or a bare number of seconds.
 *
 * Returns `null` for anything unparseable so the caller can report which
 * variable is wrong instead of silently applying a default TTL.
 */
export function parseDurationSeconds(raw: string | undefined): number | null {
  if (raw === undefined) return null;

  const match = /^(\d+)\s*(s|m|h|d)?$/i.exec(raw.trim());
  if (!match) return null;

  const amount = Number.parseInt(match[1], 10);
  if (!Number.isInteger(amount) || amount <= 0) return null;

  const unitSeconds: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return amount * unitSeconds[(match[2] ?? 's').toLowerCase()];
}

/**
 * Resolves one JWT secret.
 *
 * Production must supply a real secret — the process refuses to start without
 * one. Outside production a random per-process secret is generated so a
 * developer machine or a test run never depends on a secret committed to the
 * repository; the cost is that tokens do not survive a restart.
 */
function resolveJwtSecret(
  raw: string | undefined,
  variableName: string,
  isProduction: boolean,
  problems: string[],
  warnings: string[],
): string {
  const secret = raw?.trim();

  if (secret) {
    if (secret.length < MIN_SECRET_LENGTH) {
      problems.push(`${variableName} must be at least ${MIN_SECRET_LENGTH} characters long`);
    }
    return secret;
  }

  if (isProduction) {
    problems.push(`${variableName} is required in production`);
    return '';
  }

  warnings.push(
    `${variableName} is not set; using a random per-process secret. ` +
      'Tokens issued before a restart will stop working.',
  );
  return randomBytes(48).toString('base64url');
}

/**
 * Builds the validated application configuration.
 *
 * Fails fast on startup rather than surfacing misconfiguration later as a
 * confusing runtime error.
 */
export function loadConfiguration(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const problems: string[] = [];
  const warnings: string[] = [];

  const nodeEnv = env.NODE_ENV ?? 'development';
  const appEnv = (env.APP_ENV ?? 'local') as AppEnvironment;
  const isProduction = nodeEnv === 'production';

  const port = Number.parseInt(env.PORT ?? '3001', 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    problems.push(`PORT must be a valid port number, received "${env.PORT}"`);
  }

  const logLevelRaw = (env.LOG_LEVEL ?? 'info').toLowerCase() as LogLevel;
  if (!LOG_LEVELS.includes(logLevelRaw)) {
    problems.push(`LOG_LEVEL must be one of ${LOG_LEVELS.join(', ')}, received "${env.LOG_LEVEL}"`);
  }

  const frontendUrls = parseOriginList(env.FRONTEND_URL);
  if (isProduction && frontendUrls.length === 0) {
    problems.push('FRONTEND_URL is required in production for CORS configuration');
  }

  const devToolsEnabled = parseBoolean(env.DEV_TOOLS_ENABLED, false);
  const allowMockIntegrations = parseBoolean(env.ALLOW_MOCK_INTEGRATIONS, !isProduction);

  const transactionTimeoutMs = parsePositiveInt(
    env.DATABASE_TRANSACTION_TIMEOUT_MS,
    DEFAULT_TRANSACTION_TIMEOUT_MS,
    'DATABASE_TRANSACTION_TIMEOUT_MS',
    problems,
  );
  const transactionMaxWaitMs = parsePositiveInt(
    env.DATABASE_TRANSACTION_MAX_WAIT_MS,
    DEFAULT_TRANSACTION_MAX_WAIT_MS,
    'DATABASE_TRANSACTION_MAX_WAIT_MS',
    problems,
  );

  const lockTtlSeconds = parsePositiveInt(
    env.LOCK_TTL_SECONDS,
    DEFAULT_LOCK_TTL_SECONDS,
    'LOCK_TTL_SECONDS',
    problems,
  );
  const lockHeartbeatSeconds = parsePositiveInt(
    env.LOCK_HEARTBEAT_SECONDS,
    DEFAULT_LOCK_HEARTBEAT_SECONDS,
    'LOCK_HEARTBEAT_SECONDS',
    problems,
  );

  if (lockHeartbeatSeconds >= lockTtlSeconds) {
    // A heartbeat that cannot fire before the TTL expires would let an active
    // user lose their lock mid-reading.
    problems.push('LOCK_HEARTBEAT_SECONDS must be smaller than LOCK_TTL_SECONDS');
  }

  const storageDriver = (env.OBJECT_STORAGE_DRIVER ?? 'local').trim().toLowerCase();
  if (storageDriver !== 'local' && storageDriver !== 's3') {
    problems.push(`OBJECT_STORAGE_DRIVER must be local or s3, received "${env.OBJECT_STORAGE_DRIVER}"`); // prettier-ignore
  }
  if (storageDriver === 'local' && isProduction) {
    // Local files do not survive a container rebuild, so a production pilot
    // must point at a real bucket (DEVOPS-004).
    warnings.push(
      'OBJECT_STORAGE_DRIVER=local in production: dictation audio will not survive a redeploy.',
    );
  }

  const playbackUrlTtlSeconds = parsePositiveInt(
    env.PLAYBACK_URL_TTL_SECONDS,
    DEFAULT_PLAYBACK_URL_TTL_SECONDS,
    'PLAYBACK_URL_TTL_SECONDS',
    problems,
  );
  const maxUploadBytes = parsePositiveInt(
    env.MAX_DICTATION_UPLOAD_BYTES,
    DEFAULT_MAX_UPLOAD_BYTES,
    'MAX_DICTATION_UPLOAD_BYTES',
    problems,
  );

  const accessSecret = resolveJwtSecret(env.JWT_SECRET, 'JWT_SECRET', isProduction, problems, warnings); // prettier-ignore
  const refreshSecret = resolveJwtSecret(env.JWT_REFRESH_SECRET, 'JWT_REFRESH_SECRET', isProduction, problems, warnings); // prettier-ignore

  if (accessSecret && accessSecret === refreshSecret) {
    problems.push('JWT_SECRET and JWT_REFRESH_SECRET must be different values');
  }

  const accessTtlSeconds = parseDurationSeconds(env.JWT_ACCESS_TTL ?? DEFAULT_ACCESS_TTL);
  if (accessTtlSeconds === null) {
    problems.push(`JWT_ACCESS_TTL must be a duration such as 15m, received "${env.JWT_ACCESS_TTL}"`);
  }

  const refreshTtlSeconds = parseDurationSeconds(env.JWT_REFRESH_TTL ?? DEFAULT_REFRESH_TTL);
  if (refreshTtlSeconds === null) {
    problems.push(`JWT_REFRESH_TTL must be a duration such as 7d, received "${env.JWT_REFRESH_TTL}"`);
  }

  if (problems.length > 0) {
    throw new EnvironmentError(problems);
  }

  return {
    nodeEnv,
    appEnv,
    port,
    frontendUrls: frontendUrls.length > 0 ? frontendUrls : ['http://localhost:3000'],
    logLevel: logLevelRaw,
    isProduction,
    devToolsEnabled,
    allowMockIntegrations,
    database: { transactionTimeoutMs, transactionMaxWaitMs },
    jwt: {
      accessSecret,
      refreshSecret,
      accessTtlSeconds: accessTtlSeconds as number,
      refreshTtlSeconds: refreshTtlSeconds as number,
    },
    lock: { ttlSeconds: lockTtlSeconds, heartbeatSeconds: lockHeartbeatSeconds },
    storage: {
      driver: storageDriver as StorageDriver,
      localDir: env.OBJECT_STORAGE_LOCAL_DIR?.trim() || DEFAULT_STORAGE_LOCAL_DIR,
      playbackUrlTtlSeconds,
      maxUploadBytes,
    },
    warnings,
  };
}

/** Registered under the `app` namespace in the Nest ConfigModule. */
export default (): { app: AppConfig } => ({ app: loadConfiguration() });
