import { Global, Module, OnModuleInit } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { PrismaHealthIndicator } from './prisma.health';
import { HealthRegistry } from '../health/health.registry';

@Global()
@Module({
  providers: [PrismaService, PrismaHealthIndicator],
  exports: [PrismaService],
})
export class PrismaModule implements OnModuleInit {
  constructor(
    private readonly registry: HealthRegistry,
    private readonly indicator: PrismaHealthIndicator,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.indicator);
  }
}
