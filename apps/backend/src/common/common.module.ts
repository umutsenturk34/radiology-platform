import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from './logging/app-logger.service';
import type { LogLevel } from '../config/configuration';

/**
 * Cross-cutting providers available to every module without re-importing.
 */
@Global()
@Module({
  providers: [
    {
      provide: AppLogger,
      useFactory: (config: ConfigService) =>
        new AppLogger(config.get<LogLevel>('app.logLevel') ?? 'info'),
      inject: [ConfigService],
    },
  ],
  exports: [AppLogger],
})
export class CommonModule {}
