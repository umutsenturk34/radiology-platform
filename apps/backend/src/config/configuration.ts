/**
 * Environment configuration.
 *
 * Required/optional variable names follow docs/DEPLOYMENT_PILOT.md
 * sections 23, 24 and 29.
 *
 * Rule: this file must never log or echo secret values.
 */

export type AppEnvironment = 'local' | 'development' | 'pilot' | 'production' | 'test';

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
}

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

function parseOriginList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

/**
 * Builds the validated application configuration.
 *
 * Fails fast on startup rather than surfacing misconfiguration later as a
 * confusing runtime error.
 */
export function loadConfiguration(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const problems: string[] = [];

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
  };
}

/** Registered under the `app` namespace in the Nest ConfigModule. */
export default (): { app: AppConfig } => ({ app: loadConfiguration() });
