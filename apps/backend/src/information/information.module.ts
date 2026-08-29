import { Module } from '@nestjs/common';
import { InformationController } from './information.controller';
import { InformationService } from './information.service';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { RealtimeModule } from '../realtime/realtime.module';

/** Information notes and their history (TASK_QUEUE BACKEND-041). */
@Module({
  imports: [AuthModule, AuditModule, RealtimeModule],
  controllers: [InformationController],
  providers: [InformationService],
  exports: [InformationService],
})
export class InformationModule {}
