import { Module } from '@nestjs/common';
import { WorkflowModule } from '../workflow/workflow.module';
import { HL7_ADAPTER } from './contracts/hl7.contract';
import { MockHl7Adapter } from './hl7/mock-hl7.adapter';
import { Hl7Service } from './hl7/hl7.service';
import { IntegrationRegistryService } from './integration-registry.service';

/**
 * Integration boundary (docs/INTEGRATIONS.md section 3).
 *
 * The pilot registers `MockHl7Adapter` as the default HL7 adapter. Adding a
 * hospital-specific adapter means registering it here; no core service changes.
 */
@Module({
  imports: [WorkflowModule],
  providers: [
    MockHl7Adapter,
    { provide: HL7_ADAPTER, useExisting: MockHl7Adapter },
    IntegrationRegistryService,
    Hl7Service,
  ],
  exports: [IntegrationRegistryService, Hl7Service],
})
export class IntegrationsModule {}
