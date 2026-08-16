import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { AuthModule } from '../auth/auth.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { LocksModule } from '../locks/locks.module';

/** Reporter workflow and report versioning (TASK_QUEUE BACKEND-025..029). */
@Module({
  imports: [AuthModule, WorkflowModule, LocksModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
