import { Inject, Injectable } from '@nestjs/common';
import { HL7_ADAPTER, type Hl7Adapter } from './contracts/hl7.contract';

/**
 * Chooses the adapter to use for a hospital (docs/INTEGRATIONS.md section 4).
 *
 * Hospital-specific selection lives here rather than leaking into controllers
 * or workflow services. The pilot has one HL7 adapter (the mock), so every
 * hospital resolves to it; adding `HospitalAHl7Adapter` later means adding an
 * entry here, not touching the call sites.
 */
@Injectable()
export class IntegrationRegistryService {
  private readonly hl7ByHospitalId = new Map<string, Hl7Adapter>();

  constructor(@Inject(HL7_ADAPTER) private readonly defaultHl7Adapter: Hl7Adapter) {}

  getHl7Adapter(hospitalId: string): Hl7Adapter {
    return this.hl7ByHospitalId.get(hospitalId) ?? this.defaultHl7Adapter;
  }

  /** Registers a hospital-specific adapter, overriding the default. */
  registerHl7Adapter(hospitalId: string, adapter: Hl7Adapter): void {
    this.hl7ByHospitalId.set(hospitalId, adapter);
  }
}
