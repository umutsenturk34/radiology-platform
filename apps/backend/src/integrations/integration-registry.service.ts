import { Inject, Injectable } from '@nestjs/common';
import { HL7_ADAPTER, type Hl7Adapter } from './contracts/hl7.contract';
import { PACS_ADAPTER, type PacsAdapter } from './contracts/pacs.contract';

/**
 * Chooses the adapter to use for a hospital (docs/INTEGRATIONS.md section 4).
 *
 * Hospital-specific selection lives here rather than leaking into controllers
 * or workflow services. The pilot has one HL7 adapter and one PACS adapter (the
 * mock and the test one), so every hospital resolves to them; adding
 * `HospitalAHl7Adapter` or an Orthanc adapter later means adding an entry here,
 * not touching the call sites.
 */
@Injectable()
export class IntegrationRegistryService {
  private readonly hl7ByHospitalId = new Map<string, Hl7Adapter>();
  private readonly pacsByHospitalId = new Map<string, PacsAdapter>();

  constructor(
    @Inject(HL7_ADAPTER) private readonly defaultHl7Adapter: Hl7Adapter,
    @Inject(PACS_ADAPTER) private readonly defaultPacsAdapter: PacsAdapter,
  ) {}

  getHl7Adapter(hospitalId: string): Hl7Adapter {
    return this.hl7ByHospitalId.get(hospitalId) ?? this.defaultHl7Adapter;
  }

  /** Registers a hospital-specific adapter, overriding the default. */
  registerHl7Adapter(hospitalId: string, adapter: Hl7Adapter): void {
    this.hl7ByHospitalId.set(hospitalId, adapter);
  }

  getPacsAdapter(hospitalId: string): PacsAdapter {
    return this.pacsByHospitalId.get(hospitalId) ?? this.defaultPacsAdapter;
  }

  registerPacsAdapter(hospitalId: string, adapter: PacsAdapter): void {
    this.pacsByHospitalId.set(hospitalId, adapter);
  }
}
