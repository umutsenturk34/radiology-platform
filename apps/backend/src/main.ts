import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { API_PREFIX, configureApp } from './app.setup';
import { loadConfiguration } from './config/configuration';
import { AppLogger } from './common/logging/app-logger.service';

async function bootstrap(): Promise<void> {
  const config = loadConfiguration();
  const logger = new AppLogger(config.logLevel);

  const app = await NestFactory.create(AppModule, { logger });
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
