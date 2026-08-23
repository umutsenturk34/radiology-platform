import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import {
  PacsAvailability,
  type PacsAdapter,
  type PacsAvailabilityResult,
  type PacsSeriesLookup,
  type PacsSeriesResult,
  type PacsStudyLookup,
  type PacsStudyResult,
  type PacsViewerAccess,
  type PacsViewerRequest,
} from '../contracts/pacs.contract';
import type { PacsConfig } from '../../config/configuration';

/** DICOM UID root reserved for test data. */
const TEST_UID_ROOT = '1.2.826.0.1.3680043.10.999';

/**
 * Documented pilot fallback when no real PACS is reachable
 * (TASK_QUEUE BACKEND-020: "Preferred Orthanc, Fallback test metadata
 * adapter", CLAUDE.md section 30).
 *
 * Everything it returns is derived from the accession number by hashing, so the
 * same study always produces the same UIDs and series across restarts and
 * across test runs — no randomness anywhere (the rule the mock HBYS adapter
 * follows for the same reason).
 *
 * The one thing it will NOT do is invent a working viewer. If no test viewer is
 * configured it answers `available: false` with a reason, because claiming a
 * viewer that does not open is exactly the failure CLAUDE.md section 30
 * prohibits: a doctor would be told the images are there and find nothing.
 */
@Injectable()
export class TestPacsAdapter implements PacsAdapter {
  readonly name = 'TestPacsAdapter';

  private readonly config: PacsConfig;

  constructor(config: ConfigService) {
    this.config = config.getOrThrow<PacsConfig>('app.pacs');
  }

  async findStudy(input: PacsStudyLookup): Promise<PacsStudyResult> {
    if (this.config.testMode === 'ERROR') {
      return { found: false, studyInstanceUid: null, seriesCount: null };
    }

    return {
      found: true,
      studyInstanceUid: this.studyUid(input),
      seriesCount: this.seriesFor(input).length,
    };
  }

  async listSeries(input: PacsSeriesLookup): Promise<PacsSeriesResult[]> {
    if (this.config.testMode === 'ERROR' || this.config.testMode === 'PENDING') {
      return [];
    }

    const series = this.seriesFor(input);
    // PARTIAL is the case the health team flagged: some series arrived and
    // some did not (docs/INTEGRATIONS.md section 26). Dropping the last one
    // models that without pretending the study is complete.
    return this.config.testMode === 'PARTIAL' ? series.slice(0, 1) : series;
  }

  async checkAvailability(input: PacsStudyLookup): Promise<PacsAvailabilityResult> {
    const studyInstanceUid = this.studyUid(input);

    if (this.config.testMode === 'ERROR') {
      return {
        status: PacsAvailability.ERROR,
        studyInstanceUid: null,
        seriesCount: null,
        // A technical failure, deliberately distinct from the clinical
        // IMAGE_MISSING decision (section 27).
        errorMessage: 'Test PACS adapter is configured to report an integration error.',
      };
    }

    if (this.config.testMode === 'PENDING') {
      return { status: PacsAvailability.PENDING, studyInstanceUid, seriesCount: 0 };
    }

    const series = await this.listSeries(input);
    return {
      status:
        this.config.testMode === 'PARTIAL' ? PacsAvailability.PARTIAL : PacsAvailability.AVAILABLE,
      studyInstanceUid,
      seriesCount: series.length,
    };
  }

  async getViewerAccess(input: PacsViewerRequest): Promise<PacsViewerAccess> {
    const availability = await this.checkAvailability(input);

    if (availability.status === PacsAvailability.ERROR) {
      return {
        available: false,
        viewerUrl: null,
        expiresAt: null,
        studyInstanceUid: null,
        reason: 'PACS_ERROR',
      };
    }

    if (availability.status === PacsAvailability.PENDING) {
      return {
        available: false,
        viewerUrl: null,
        expiresAt: null,
        studyInstanceUid: availability.studyInstanceUid,
        reason: 'IMAGES_NOT_READY',
      };
    }

    if (!this.config.testViewerBaseUrl) {
      // No viewer exists to open. Saying so is the honest answer; a synthesized
      // URL would be a lie the doctor only discovers after clicking it.
      return {
        available: false,
        viewerUrl: null,
        expiresAt: null,
        studyInstanceUid: availability.studyInstanceUid,
        reason: 'PACS_VIEWER_NOT_CONFIGURED',
      };
    }

    const url = new URL(this.config.testViewerBaseUrl);
    url.searchParams.set('studyInstanceUid', availability.studyInstanceUid ?? '');

    return {
      available: true,
      viewerUrl: url.toString(),
      expiresAt: new Date(Date.now() + this.config.viewerTtlSeconds * 1000).toISOString(),
      studyInstanceUid: availability.studyInstanceUid,
    };
  }

  /** Stable per hospital+accession, so repeated calls agree. */
  private studyUid(input: PacsStudyLookup): string {
    if (input.studyInstanceUid) return input.studyInstanceUid;

    const digest = createHash('sha256')
      .update(`${input.hospitalId}:${input.accessionNumber}`)
      .digest();
    // Two 9-digit groups keep the UID inside the 64-character DICOM limit.
    const left = digest.readUInt32BE(0) % 1_000_000_000;
    const right = digest.readUInt32BE(4) % 1_000_000_000;

    return `${TEST_UID_ROOT}.${left}.${right}`;
  }

  private seriesFor(input: PacsStudyLookup): PacsSeriesResult[] {
    const base = this.studyUid(input);

    return [
      {
        seriesInstanceUid: `${base}.1`,
        seriesNumber: 1,
        seriesDescription: 'Scout',
        modality: 'CT',
        imageCount: 3,
      },
      {
        seriesInstanceUid: `${base}.2`,
        seriesNumber: 2,
        seriesDescription: 'Parankim',
        modality: 'CT',
        imageCount: 120,
      },
    ];
  }
}
