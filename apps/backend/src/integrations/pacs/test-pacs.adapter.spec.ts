import { ConfigService } from '@nestjs/config';
import { TestPacsAdapter } from './test-pacs.adapter';
import { PacsAvailability } from '../contracts/pacs.contract';
import type { PacsConfig } from '../../config/configuration';

/**
 * The pilot PACS fallback (TASK_QUEUE BACKEND-020).
 *
 * Two properties matter here: it is deterministic, and it never claims a viewer
 * it cannot deliver.
 */
describe('TestPacsAdapter', () => {
  const LOOKUP = {
    hospitalId: 'hospital-a',
    accessionNumber: 'ACC-001',
    userId: 'u-doctor',
  };

  const build = (overrides: Partial<PacsConfig> = {}) => {
    const config: PacsConfig = {
      driver: 'test',
      testViewerBaseUrl: 'https://viewer.test.local/open',
      testMode: 'AVAILABLE',
      viewerTtlSeconds: 900,
      ...overrides,
    };
    return new TestPacsAdapter({
      getOrThrow: () => config,
    } as unknown as ConfigService);
  };

  describe('determinism', () => {
    it('returns the same study UID for the same accession every time', async () => {
      const first = await build().findStudy(LOOKUP);
      const second = await build().findStudy(LOOKUP);

      expect(first.studyInstanceUid).toBe(second.studyInstanceUid);
      expect(first.studyInstanceUid).toEqual(expect.any(String));
    });

    it('separates studies that share an accession across hospitals', async () => {
      // Accession numbers are only unique within a hospital
      // (docs/DATA_MODEL.md section 16), so the UID must depend on both.
      const a = await build().findStudy(LOOKUP);
      const b = await build().findStudy({ ...LOOKUP, hospitalId: 'hospital-b' });

      expect(a.studyInstanceUid).not.toBe(b.studyInstanceUid);
    });

    it('keeps the UID within the 64 character DICOM limit', async () => {
      const { studyInstanceUid } = await build().findStudy(LOOKUP);

      expect(studyInstanceUid!.length).toBeLessThanOrEqual(64);
      expect(studyInstanceUid).toMatch(/^[0-9.]+$/);
    });

    it('prefers a UID the study already carries over a synthesized one', async () => {
      const known = '1.2.840.113619.2.55.3.1234';
      const result = await build().findStudy({ ...LOOKUP, studyInstanceUid: known });

      expect(result.studyInstanceUid).toBe(known);
    });
  });

  describe('viewer honesty', () => {
    it('offers a viewer when one is configured', async () => {
      const access = await build().getViewerAccess(LOOKUP);

      expect(access).toMatchObject({ available: true, studyInstanceUid: expect.any(String) });
      expect(access.viewerUrl).toContain('studyInstanceUid=');
      expect(access.expiresAt).toEqual(expect.any(String));
    });

    it('refuses to invent a viewer when none is configured', async () => {
      // CLAUDE.md section 30: do not fake successful viewer access. A URL that
      // does not open is worse than an honest "unavailable".
      const access = await build({ testViewerBaseUrl: '' }).getViewerAccess(LOOKUP);

      expect(access).toMatchObject({
        available: false,
        viewerUrl: null,
        reason: 'PACS_VIEWER_NOT_CONFIGURED',
      });
    });

    it('reports images that have not arrived as not ready, not as broken', async () => {
      const access = await build({ testMode: 'PENDING' }).getViewerAccess(LOOKUP);

      expect(access).toMatchObject({ available: false, reason: 'IMAGES_NOT_READY' });
    });

    it('reports an integration failure as an error', async () => {
      const access = await build({ testMode: 'ERROR' }).getViewerAccess(LOOKUP);

      expect(access).toMatchObject({ available: false, viewerUrl: null, reason: 'PACS_ERROR' });
    });
  });

  describe('availability states', () => {
    it('is AVAILABLE with every series present', async () => {
      const adapter = build();

      expect(await adapter.checkAvailability(LOOKUP)).toMatchObject({
        status: PacsAvailability.AVAILABLE,
        seriesCount: 2,
      });
      expect(await adapter.listSeries(LOOKUP)).toHaveLength(2);
    });

    it('is PARTIAL when only some series arrived', async () => {
      const adapter = build({ testMode: 'PARTIAL' });

      expect(await adapter.checkAvailability(LOOKUP)).toMatchObject({
        status: PacsAvailability.PARTIAL,
        seriesCount: 1,
      });
    });

    it('is PENDING with no series yet', async () => {
      const adapter = build({ testMode: 'PENDING' });

      expect(await adapter.checkAvailability(LOOKUP)).toMatchObject({
        status: PacsAvailability.PENDING,
      });
      expect(await adapter.listSeries(LOOKUP)).toEqual([]);
    });

    it('reports ERROR with a message and no UID', async () => {
      const result = await build({ testMode: 'ERROR' }).checkAvailability(LOOKUP);

      // A technical integration state, never to be confused with the clinical
      // IMAGE_MISSING decision (docs/INTEGRATIONS.md section 27).
      expect(result).toMatchObject({
        status: PacsAvailability.ERROR,
        studyInstanceUid: null,
        errorMessage: expect.any(String),
      });
    });
  });
});
