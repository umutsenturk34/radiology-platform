import { Module } from '@nestjs/common';
import { DevToolsController } from './dev-tools.controller';
import { DevToolsGuard } from './dev-tools.guard';
import { AuthModule } from '../auth/auth.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { StudiesModule } from '../studies/studies.module';

/**
 * Pilot-only tooling (TASK_QUEUE BACKEND-050).
 *
 * The module is always registered; access is refused per request by
 * `DevToolsGuard` when `DEV_TOOLS_ENABLED` is false, so a production
 * misconfiguration shows up as an explicit, auditable 403 rather than a
 * confusing 404.
 */
@Module({
  imports: [AuthModule, IntegrationsModule, StudiesModule],
  controllers: [DevToolsController],
  providers: [DevToolsGuard],
})
export class DevToolsModule {}
