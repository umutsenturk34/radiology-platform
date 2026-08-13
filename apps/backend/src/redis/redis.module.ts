import { Global, Module, OnModuleInit } from '@nestjs/common';
import { RedisService } from './redis.service';
import { RedisHealthIndicator } from './redis.health';
import { HealthRegistry } from '../health/health.registry';

@Global()
@Module({
  providers: [RedisService, RedisHealthIndicator],
  exports: [RedisService],
})
export class RedisModule implements OnModuleInit {
  constructor(
    private readonly registry: HealthRegistry,
    private readonly indicator: RedisHealthIndicator,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.indicator);
  }
}
