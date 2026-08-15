import { Module } from '@nestjs/common';
import { StudiesController } from './studies.controller';
import { StudiesService } from './studies.service';
import { AuthModule } from '../auth/auth.module';

/** Study reads (TASK_QUEUE BACKEND-009). Writes go through the workflow module. */
@Module({
  imports: [AuthModule],
  controllers: [StudiesController],
  providers: [StudiesService],
  exports: [StudiesService],
})
export class StudiesModule {}
