import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { CommonModule } from './common/common.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { StudiesModule } from './studies/studies.module';

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
    PrismaModule,
    RedisModule,
    AuthModule,
    StudiesModule,
  ],
})
export class AppModule {}
