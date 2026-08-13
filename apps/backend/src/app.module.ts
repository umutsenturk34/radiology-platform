import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { CommonModule } from './common/common.module';
import { HealthModule } from './health/health.module';

/**
 * Root module of the modular monolith.
 *
 * Domain modules (auth, studies, workflow, locks, dictations, reports,
 * integrations, queues, realtime, dev-tools) are registered here as they land.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      envFilePath: ['.env.local', '.env'],
    }),
    CommonModule,
    HealthModule,
  ],
})
export class AppModule {}
