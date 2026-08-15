import { Module } from '@nestjs/common';
import { WorkflowService } from './workflow.service';

/**
 * Central study workflow (TASK_QUEUE BACKEND-014).
 *
 * Exposes no controller on purpose: there is no generic "set status" API
 * (CLAUDE.md section 11). Action endpoints live in their own modules and call
 * this service.
 */
@Module({
  providers: [WorkflowService],
  exports: [WorkflowService],
})
export class WorkflowModule {}
