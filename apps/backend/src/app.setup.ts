import { ValidationPipe, type INestApplication, type ValidationError } from '@nestjs/common';
import type { AppConfig } from './config/configuration';
import { AppLogger } from './common/logging/app-logger.service';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';
import { RequestLoggingInterceptor } from './common/interceptors/request-logging.interceptor';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { ValidationAppException } from './common/errors/app.exception';

export const API_PREFIX = 'api/v1';

/**
 * Applies the global HTTP wiring.
 *
 * Shared by `main.ts` and the e2e suite so tests exercise the same prefix,
 * validation, error envelope and CORS rules that production runs.
 */
export function configureApp(
  app: INestApplication,
  config: AppConfig,
  logger: AppLogger,
): INestApplication {
  // Runs before routing so every log line and error carries the correlation id.
  const requestId = new RequestIdMiddleware();
  app.use(requestId.use.bind(requestId));

  app.setGlobalPrefix(API_PREFIX);

  // Explicit allowlist — a wildcard origin is not acceptable for an
  // authenticated API (docs/API_CONTRACT.md sections 7 and 8).
  app.enableCors({
    origin: config.frontendUrls,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'Idempotency-Key'],
    exposedHeaders: ['X-Request-Id'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      exceptionFactory: (errors) => new ValidationAppException(toFieldErrors(errors)),
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter(logger));
  app.useGlobalInterceptors(
    new RequestLoggingInterceptor(logger),
    new ResponseEnvelopeInterceptor(),
  );

  app.enableShutdownHooks();

  return app;
}

/** Flattens nested class-validator errors into `{ field: [messages] }`. */
export function toFieldErrors(
  errors: ValidationError[],
  parentPath = '',
): Record<string, string[]> {
  const fields: Record<string, string[]> = {};

  for (const error of errors) {
    const path = parentPath ? `${parentPath}.${error.property}` : error.property;

    if (error.constraints) {
      fields[path] = Object.values(error.constraints);
    }
    if (error.children && error.children.length > 0) {
      Object.assign(fields, toFieldErrors(error.children, path));
    }
  }

  return fields;
}
