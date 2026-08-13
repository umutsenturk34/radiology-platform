import { loadConfiguration } from './configuration';

const BASE_ENV = { NODE_ENV: 'test', APP_ENV: 'local' } as NodeJS.ProcessEnv;

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
    expect(() => loadConfiguration({ NODE_ENV: 'production', APP_ENV: 'pilot' })).toThrow(
      /FRONTEND_URL is required in production/,
    );
  });

  it('keeps dev tools disabled unless explicitly enabled', () => {
    expect(loadConfiguration({ ...BASE_ENV, DEV_TOOLS_ENABLED: 'true' }).devToolsEnabled).toBe(true);
    expect(loadConfiguration({ ...BASE_ENV, DEV_TOOLS_ENABLED: 'maybe' }).devToolsEnabled).toBe(
      false,
    );
  });

  it('does not allow mock integrations by default in production', () => {
    const config = loadConfiguration({
      NODE_ENV: 'production',
      APP_ENV: 'production',
      FRONTEND_URL: 'https://pilot.example.com',
    });

    expect(config.allowMockIntegrations).toBe(false);
  });
});
