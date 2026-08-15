import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { API_PREFIX, configureApp } from './app.setup';
import type { AppConfig } from './config/configuration';
import { AppLogger } from './common/logging/app-logger.service';

async function bootstrap(): Promise<void> {
  // Logs are buffered until the configured logger is available, so nothing is
  // lost and the log level is never guessed twice.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // The configuration is read from the Nest ConfigModule rather than loaded a
  // second time here: a second load would parse a different environment (the
  // .env file is only applied by ConfigModule) and would generate a second set
  // of development JWT secrets.
  const config = app.get(ConfigService).get<AppConfig>('app');
  if (!config) {
    throw new Error('Application configuration is missing; refusing to start.');
  }

  const logger = app.get(AppLogger);
  app.useLogger(logger);

  for (const warning of config.warnings) {
    logger.warn({ message: warning }, 'Bootstrap');
  }

  configureApp(app, config, logger);

  await app.listen(config.port, '0.0.0.0');

  logger.info(
    {
      message: 'Backend started',
      port: config.port,
      appEnv: config.appEnv,
      nodeEnv: config.nodeEnv,
      devToolsEnabled: config.devToolsEnabled,
      prefix: `/${API_PREFIX}`,
    },
    'Bootstrap',
  );
}

void bootstrap();
