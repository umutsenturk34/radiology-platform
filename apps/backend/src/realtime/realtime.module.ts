import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';
import { RealtimeMonitorService } from './realtime-monitor.service';
import { AuthModule } from '../auth/auth.module';
import { LocksModule } from '../locks/locks.module';
import { SlaModule } from '../sla/sla.module';

/**
 * Realtime delivery (TASK_QUEUE BACKEND-045).
 *
 * Only `RealtimeService` is exported. Domain modules emit through it and never
 * see the gateway or a Socket.IO server (docs/REALTIME_EVENTS.md section 118).
 */
@Module({
  imports: [AuthModule, LocksModule, SlaModule],
  providers: [RealtimeGateway, RealtimeService, RealtimeMonitorService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
