import { Module } from '@nestjs/common';
import { WorkflowModule } from '../workflow/workflow.module';
import { AuthModule } from '../auth/auth.module';
import { HL7_ADAPTER } from './contracts/hl7.contract';
import { HBYS_ADAPTER } from './contracts/hbys.contract';
import { PACS_ADAPTER } from './contracts/pacs.contract';
import { MockHl7Adapter } from './hl7/mock-hl7.adapter';
import { Hl7Service } from './hl7/hl7.service';
import { MockHbysAdapter } from './hbys/mock-hbys.adapter';
import { HbysDeliveryService } from './hbys/hbys-delivery.service';
import { HbysDeliveryWorker } from './hbys/hbys-delivery.worker';
import { HbysController } from './hbys/hbys.controller';
import { TestPacsAdapter } from './pacs/test-pacs.adapter';
import { PacsService } from './pacs/pacs.service';
import { PacsController } from './pacs/pacs.controller';
import { IntegrationRegistryService } from './integration-registry.service';

/**
 * Integration boundary (docs/INTEGRATIONS.md section 3).
 *
 * The pilot registers `MockHl7Adapter` as the default HL7 adapter and
 * `TestPacsAdapter` as the default PACS adapter — the documented fallback while
 * no Orthanc instance is reachable (TASK_QUEUE BACKEND-020). Adding a
 * hospital-specific adapter means registering it here; no core service changes.
 */
@Module({
  imports: [WorkflowModule, AuthModule],
  controllers: [HbysController, PacsController],
  providers: [
    MockHl7Adapter,
    { provide: HL7_ADAPTER, useExisting: MockHl7Adapter },
    MockHbysAdapter,
    { provide: HBYS_ADAPTER, useExisting: MockHbysAdapter },
    TestPacsAdapter,
    { provide: PACS_ADAPTER, useExisting: TestPacsAdapter },
    IntegrationRegistryService,
    Hl7Service,
    HbysDeliveryService,
    HbysDeliveryWorker,
    PacsService,
  ],
  exports: [IntegrationRegistryService, Hl7Service, HbysDeliveryService, MockHbysAdapter, PacsService],
})
export class IntegrationsModule {}
