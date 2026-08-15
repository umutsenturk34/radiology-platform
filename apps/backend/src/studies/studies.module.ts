import { Module } from '@nestjs/common';
import { StudiesController } from './studies.controller';
import { StudiesService } from './studies.service';
import { StudyImagesService } from './study-images.service';
import { AuthModule } from '../auth/auth.module';
import { WorkflowModule } from '../workflow/workflow.module';

/**
 * Study reads (TASK_QUEUE BACKEND-009) and the images-available event
 * (BACKEND-013). Status changes are delegated to the workflow module.
 */
@Module({
  imports: [AuthModule, WorkflowModule],
  controllers: [StudiesController],
  providers: [StudiesService, StudyImagesService],
  exports: [StudiesService, StudyImagesService],
})
export class StudiesModule {}
