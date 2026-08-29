import { Module } from '@nestjs/common';
import { StudiesController } from './studies.controller';
import { StudyActionsController } from './study-actions.controller';
import { StudiesService } from './studies.service';
import { StudyImagesService } from './study-images.service';
import { StudyActionsService } from './study-actions.service';
import { AuthModule } from '../auth/auth.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { LocksModule } from '../locks/locks.module';
import { DictationsModule } from '../dictations/dictations.module';
import { SlaModule } from '../sla/sla.module';
import { RealtimeModule } from '../realtime/realtime.module';

/**
 * Study reads (TASK_QUEUE BACKEND-009), the images-available event
 * (BACKEND-013) and the doctor/lock actions (BACKEND-016, BACKEND-017).
 * Status changes are delegated to the workflow module.
 *
 * Route order matters: `StudiesController` declares `GET :studyId`, so the
 * action controller is registered first to keep its literal paths from being
 * shadowed by the wildcard parameter.
 */
@Module({
  imports: [AuthModule, WorkflowModule, LocksModule, DictationsModule, SlaModule, RealtimeModule],
  controllers: [StudyActionsController, StudiesController],
  providers: [StudiesService, StudyImagesService, StudyActionsService],
  exports: [StudiesService, StudyImagesService, StudyActionsService],
})
export class StudiesModule {}
