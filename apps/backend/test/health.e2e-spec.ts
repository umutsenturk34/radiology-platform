import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { loadConfiguration } from '../src/config/configuration';
import { AppLogger } from '../src/common/logging/app-logger.service';

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication({ logger: false });
    // 'error' keeps the suite output clean without disabling the logger wiring.
    const config = loadConfiguration({ ...process.env, LOG_LEVEL: 'error' });
    configureApp(app, config, new AppLogger('error'));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health returns 200 inside the data envelope', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);

    expect(response.body).toHaveProperty('data');
    expect(response.body.data).toMatchObject({
      status: 'ok',
      dependencies: {},
    });
    expect(typeof response.body.data.uptimeSeconds).toBe('number');
    expect(typeof response.body.data.timestamp).toBe('string');
  });

  it('serves the API only under the /api/v1 prefix', async () => {
    await request(app.getHttpServer()).get('/health').expect(404);
  });

  it('echoes a caller supplied X-Request-Id', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('X-Request-Id', 'e2e-test-request-1')
      .expect(200);

    expect(response.headers['x-request-id']).toBe('e2e-test-request-1');
  });

  it('generates a request id when the caller does not supply one', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);

    expect(response.headers['x-request-id']).toEqual(expect.any(String));
    expect(response.headers['x-request-id'].length).toBeGreaterThan(0);
  });

  it('rejects an unsafe caller supplied request id instead of echoing it', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('X-Request-Id', 'bad id with spaces')
      .expect(200);

    expect(response.headers['x-request-id']).not.toBe('bad id with spaces');
  });

  it('returns the standard error envelope for an unknown route', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/does-not-exist').expect(404);

    expect(response.body).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: expect.any(String),
        details: {},
      },
    });
  });
});
