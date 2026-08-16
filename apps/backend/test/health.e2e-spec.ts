import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { loadConfiguration } from '../src/config/configuration';
import { AppLogger } from '../src/common/logging/app-logger.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { HBYS_QUEUE } from '../src/queues/queue.constants';
import { HbysDeliveryWorker } from '../src/integrations/hbys/hbys-delivery.worker';

/**
 * PostgreSQL and Redis are stubbed here on purpose.
 *
 * The only databases configured for this pilot are the shared Railway
 * instances, and an automated suite must never connect to them: a stray write
 * or a truncate would destroy real pilot workflow state. The module wiring,
 * routing, envelopes and health aggregation are still exercised for real.
 *
 * Live connectivity is verified separately against a running server.
 */
function createPrismaStub(alive = true) {
  return {
    ping: jest.fn(async () => {
      if (!alive) throw new Error('database unavailable');
      return true;
    }),
    $connect: jest.fn(async () => undefined),
    $disconnect: jest.fn(async () => undefined),
    onModuleInit: jest.fn(async () => undefined),
    onModuleDestroy: jest.fn(async () => undefined),
  };
}

function createRedisStub(alive = true) {
  return {
    ping: jest.fn(async () => {
      if (!alive) throw new Error('redis unavailable');
      return true;
    }),
    getClient: jest.fn(() => {
      throw new Error('Redis client is not available in tests.');
    }),
    onModuleInit: jest.fn(async () => undefined),
    onModuleDestroy: jest.fn(async () => undefined),
  };
}

async function bootstrapTestApp(options: {
  databaseAlive?: boolean;
  redisAlive?: boolean;
}): Promise<INestApplication> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue(createPrismaStub(options.databaseAlive ?? true))
    .overrideProvider(RedisService)
    .useValue(createRedisStub(options.redisAlive ?? true))
    // BullMQ needs a real Redis connection; the health suite only exercises
    // routing and dependency reporting, so the queue and worker are replaced.
    .overrideProvider(HBYS_QUEUE)
    .useValue({ add: () => Promise.resolve({ id: 'job' }), close: () => Promise.resolve() })
    .overrideProvider(HbysDeliveryWorker)
    .useValue({ onModuleInit: () => undefined, onApplicationShutdown: () => Promise.resolve() })
    .compile();

  const app = moduleRef.createNestApplication({ logger: false });
  // 'error' keeps the suite output clean without disabling the logger wiring.
  const config = loadConfiguration({ ...process.env, LOG_LEVEL: 'error' });
  configureApp(app, config, new AppLogger('error'));
  await app.init();
  return app;
}

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await bootstrapTestApp({});
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health returns 200 inside the data envelope', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);

    expect(response.body).toHaveProperty('data');
    expect(response.body.data).toMatchObject({ status: 'ok' });
    expect(typeof response.body.data.uptimeSeconds).toBe('number');
    expect(typeof response.body.data.timestamp).toBe('string');
  });

  it('reports both infrastructure dependencies', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);

    expect(response.body.data.dependencies).toMatchObject({
      database: { status: 'up' },
      redis: { status: 'up' },
    });
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

describe('Health (e2e) — degraded dependency', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await bootstrapTestApp({ databaseAlive: false });
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 503 and marks the failing dependency down', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(503);

    expect(response.body.data.status).toBe('degraded');
    expect(response.body.data.dependencies.database.status).toBe('down');
    expect(response.body.data.dependencies.redis.status).toBe('up');
  });
});
