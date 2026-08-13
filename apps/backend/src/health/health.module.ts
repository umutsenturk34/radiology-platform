import { Global, Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { HealthRegistry } from './health.registry';

/**
 * Global so infrastructure modules can inject `HealthRegistry` and publish
 * their dependency status without importing the whole health module.
 */
@Global()
@Module({
  controllers: [HealthController],
  providers: [HealthService, HealthRegistry],
  exports: [HealthRegistry],
})
export class HealthModule {}
