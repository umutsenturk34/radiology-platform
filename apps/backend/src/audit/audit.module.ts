import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';

/**
 * Audit is needed by nearly every domain module, so it is global rather than
 * imported everywhere (CLAUDE.md section 33).
 */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
