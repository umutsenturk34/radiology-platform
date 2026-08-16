import { Module } from '@nestjs/common';
import { DictationsController } from './dictations.controller';
import { DictationsService } from './dictations.service';
import { PlaybackTokenService } from './playback-token.service';
import { AuthModule } from '../auth/auth.module';
import { LocksModule } from '../locks/locks.module';

/** Voice dictation (TASK_QUEUE BACKEND-023). */
@Module({
  imports: [AuthModule, LocksModule],
  controllers: [DictationsController],
  providers: [DictationsService, PlaybackTokenService],
  exports: [DictationsService],
})
export class DictationsModule {}
