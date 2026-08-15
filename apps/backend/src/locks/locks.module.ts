import { Module } from '@nestjs/common';
import { StudyLockService } from './study-lock.service';

/** Redis study locking (TASK_QUEUE BACKEND-015). */
@Module({
  providers: [StudyLockService],
  exports: [StudyLockService],
})
export class LocksModule {}
