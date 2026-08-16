import { loadConfiguration, parseDurationSeconds } from './configuration';

const BASE_ENV = { NODE_ENV: 'test', APP_ENV: 'local' } as NodeJS.ProcessEnv;

const SECRET_A = 'a'.repeat(48);
const SECRET_B = 'b'.repeat(48);

const PRODUCTION_ENV = {
  NODE_ENV: 'production',
  APP_ENV: 'production',
  FRONTEND_URL: 'https://pilot.example.com',
  JWT_SECRET: SECRET_A,
  JWT_REFRESH_SECRET: SECRET_B,
} as NodeJS.ProcessEnv;

describe('loadConfiguration', () => {
  it('applies pilot defaults when optional variables are absent', () => {
    const config = loadConfiguration({ ...BASE_ENV });

    expect(config.port).toBe(3001);
    expect(config.logLevel).toBe('info');
    expect(config.frontendUrls).toEqual(['http://localhost:3000']);
    expect(config.devToolsEnabled).toBe(false);
    expect(config.isProduction).toBe(false);
  });

  it('parses a comma separated CORS origin allowlist', () => {
    const config = loadConfiguration({
      ...BASE_ENV,
      FRONTEND_URL: 'http://localhost:3000, https://pilot.example.com ',
    });

    expect(config.frontendUrls).toEqual(['http://localhost:3000', 'https://pilot.example.com']);
  });

  it('rejects an invalid PORT rather than starting on a surprise port', () => {
    expect(() => loadConfiguration({ ...BASE_ENV, PORT: 'not-a-port' })).toThrow(
      /PORT must be a valid port number/,
    );
  });

  it('rejects an unknown LOG_LEVEL', () => {
    expect(() => loadConfiguration({ ...BASE_ENV, LOG_LEVEL: 'chatty' })).toThrow(/LOG_LEVEL/);
  });

  it('requires FRONTEND_URL in production so CORS cannot fall back to localhost', () => {
    expect(() =>
      loadConfiguration({ ...PRODUCTION_ENV, APP_ENV: 'pilot', FRONTEND_URL: undefined }),
    ).toThrow(/FRONTEND_URL is required in production/);
  });

  it('keeps dev tools disabled unless explicitly enabled', () => {
    expect(loadConfiguration({ ...BASE_ENV, DEV_TOOLS_ENABLED: 'true' }).devToolsEnabled).toBe(true);
    expect(loadConfiguration({ ...BASE_ENV, DEV_TOOLS_ENABLED: 'maybe' }).devToolsEnabled).toBe(
      false,
    );
  });

  it('does not allow mock integrations by default in production', () => {
    const config = loadConfiguration(PRODUCTION_ENV);

    expect(config.allowMockIntegrations).toBe(false);
  });
});

describe('loadConfiguration — database', () => {
  it('applies transaction limits that survive proxy latency', () => {
    const config = loadConfiguration({ ...BASE_ENV });

    expect(config.database).toEqual({
      transactionTimeoutMs: 15000,
      transactionMaxWaitMs: 10000,
    });
  });

  it('accepts an override', () => {
    const config = loadConfiguration({
      ...BASE_ENV,
      DATABASE_TRANSACTION_TIMEOUT_MS: '30000',
      DATABASE_TRANSACTION_MAX_WAIT_MS: '5000',
    });

    expect(config.database).toEqual({
      transactionTimeoutMs: 30000,
      transactionMaxWaitMs: 5000,
    });
  });

  it.each(['0', '-1', 'soon'])('rejects %s rather than falling back silently', (raw) => {
    expect(() =>
      loadConfiguration({ ...BASE_ENV, DATABASE_TRANSACTION_TIMEOUT_MS: raw }),
    ).toThrow(/DATABASE_TRANSACTION_TIMEOUT_MS must be a positive integer/);
  });
});

describe('parseDurationSeconds', () => {
  it.each([
    ['900', 900],
    ['900s', 900],
    ['15m', 900],
    ['2h', 7200],
    ['7d', 604800],
    [' 15M ', 900],
  ])('parses %s', (raw, expected) => {
    expect(parseDurationSeconds(raw)).toBe(expected);
  });

  it.each([undefined, '', 'soon', '15 minutes', '-5m', '0m', '1w'])(
    'rejects %s instead of silently defaulting',
    (raw) => {
      expect(parseDurationSeconds(raw)).toBeNull();
    },
  );
});

describe('loadConfiguration — JWT', () => {
  it('requires both JWT secrets in production', () => {
    expect(() => loadConfiguration({ ...PRODUCTION_ENV, JWT_SECRET: undefined })).toThrow(
      /JWT_SECRET is required in production/,
    );
    expect(() => loadConfiguration({ ...PRODUCTION_ENV, JWT_REFRESH_SECRET: undefined })).toThrow(
      /JWT_REFRESH_SECRET is required in production/,
    );
  });

  it('rejects a short secret', () => {
    expect(() => loadConfiguration({ ...PRODUCTION_ENV, JWT_SECRET: 'too-short' })).toThrow(
      /JWT_SECRET must be at least 32 characters/,
    );
  });

  it('rejects reusing one secret for both token types', () => {
    expect(() => loadConfiguration({ ...PRODUCTION_ENV, JWT_REFRESH_SECRET: SECRET_A })).toThrow(
      /must be different values/,
    );
  });

  it('generates distinct per-process secrets outside production and warns', () => {
    const config = loadConfiguration({ ...BASE_ENV });

    expect(config.jwt.accessSecret.length).toBeGreaterThanOrEqual(32);
    expect(config.jwt.accessSecret).not.toBe(config.jwt.refreshSecret);
    expect(config.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('JWT_SECRET'),
        expect.stringContaining('JWT_REFRESH_SECRET'),
      ]),
    );
  });

  it('applies the documented pilot TTL defaults', () => {
    const config = loadConfiguration({ ...BASE_ENV });

    expect(config.jwt.accessTtlSeconds).toBe(900);
    expect(config.jwt.refreshTtlSeconds).toBe(604800);
    expect(config.warnings).not.toContain(expect.stringContaining('TTL'));
  });

  it('rejects an unparseable TTL rather than falling back to a default', () => {
    expect(() => loadConfiguration({ ...BASE_ENV, JWT_ACCESS_TTL: 'quarter hour' })).toThrow(
      /JWT_ACCESS_TTL must be a duration/,
    );
    expect(() => loadConfiguration({ ...BASE_ENV, JWT_REFRESH_TTL: 'forever' })).toThrow(
      /JWT_REFRESH_TTL must be a duration/,
    );
  });

  it('produces no JWT warnings when both secrets are configured', () => {
    const warnings = loadConfiguration(PRODUCTION_ENV).warnings;

    expect(warnings.filter((warning) => warning.includes('JWT'))).toEqual([]);
  });
});

describe('loadConfiguration — object storage', () => {
  it('defaults to the local pilot driver', () => {
    const config = loadConfiguration({ ...BASE_ENV });

    expect(config.storage).toMatchObject({
      driver: 'local',
      localDir: '.storage',
      playbackUrlTtlSeconds: 300,
    });
  });

  it('warns that local storage does not survive a redeploy in production', () => {
    const warnings = loadConfiguration(PRODUCTION_ENV).warnings;

    expect(warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('OBJECT_STORAGE_DRIVER=local')]),
    );
  });

  it('does not warn when a real bucket is selected', () => {
    const warnings = loadConfiguration({ ...PRODUCTION_ENV, OBJECT_STORAGE_DRIVER: 's3' }).warnings;

    expect(warnings.filter((warning) => warning.includes('OBJECT_STORAGE_DRIVER'))).toEqual([]);
  });

  it('rejects an unknown driver rather than silently using local files', () => {
    expect(() => loadConfiguration({ ...BASE_ENV, OBJECT_STORAGE_DRIVER: 'dropbox' })).toThrow(
      /OBJECT_STORAGE_DRIVER must be local or s3/,
    );
  });

  it('accepts overrides for the playback TTL and upload ceiling', () => {
    const config = loadConfiguration({
      ...BASE_ENV,
      PLAYBACK_URL_TTL_SECONDS: '60',
      MAX_DICTATION_UPLOAD_BYTES: '1048576',
      OBJECT_STORAGE_LOCAL_DIR: '/var/data/audio',
    });

    expect(config.storage).toMatchObject({
      playbackUrlTtlSeconds: 60,
      maxUploadBytes: 1048576,
      localDir: '/var/data/audio',
    });
  });
});
