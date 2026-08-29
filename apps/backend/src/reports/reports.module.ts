import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ApprovalService } from './approval.service';
import { AuthModule } from '../auth/auth.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { LocksModule } from '../locks/locks.module';
import { RealtimeModule } from '../realtime/realtime.module';

/** Reporter workflow and report versioning (TASK_QUEUE BACKEND-025..029). */
@Module({
  imports: [AuthModule, WorkflowModule, LocksModule, RealtimeModule],
  controllers: [ReportsController],
  providers: [ReportsService, ApprovalService],
  exports: [ReportsService, ApprovalService],
})
export class ReportsModule {}
