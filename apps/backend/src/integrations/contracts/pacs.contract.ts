/**
 * PACS adapter boundary (TASK_QUEUE BACKEND-019,
 * docs/INTEGRATIONS.md sections 21-27).
 *
 * PACS remains the owner of the images (section 22). The platform keeps
 * identifiers, a viewer reference and availability metadata — never the DICOM
 * binaries themselves. Nothing vendor-specific may cross this boundary: how a
 * hospital's PACS is queried, how a viewer session is authenticated and what
 * its URLs look like all stay inside an adapter.
 */

export const PACS_ADAPTER = Symbol('PACS_ADAPTER');

/**
 * Technical image-delivery state (section 26).
 *
 * Explicitly NOT the same thing as the clinical `IMAGE_MISSING` study status
 * (section 27): `ERROR` here means the integration failed, while IMAGE_MISSING
 * is a decision a doctor or Operation made. One must never be derived from the
 * other automatically.
 */
export const PacsAvailability = {
  /** Never asked, or the adapter cannot say. */
  UNKNOWN: 'UNKNOWN',
  /** The study is known to PACS but images are still arriving. */
  PENDING: 'PENDING',
  AVAILABLE: 'AVAILABLE',
  /** Some series arrived, some did not — the case the health team flagged. */
  PARTIAL: 'PARTIAL',
  /** The integration itself failed. A technical state, not a clinical one. */
  ERROR: 'ERROR',
} as const;

export type PacsAvailability = (typeof PacsAvailability)[keyof typeof PacsAvailability];

/**
 * How a study is found (section 24).
 *
 * Both identifiers are offered because the adapter decides which its PACS can
 * actually resolve; the accession number is the one always present, and the
 * Study Instance UID only appears after the study has been matched once.
 */
export interface PacsStudyLookup {
  hospitalId: string;
  accessionNumber: string;
  studyInstanceUid?: string | null;
}

export interface PacsStudyResult {
  found: boolean;
  studyInstanceUid: string | null;
  /** Series count as PACS reports it, when it is cheap to obtain. */
  seriesCount: number | null;
}

/**
 * Series lookup takes the same identifiers as a study lookup. Kept as its own
 * name because docs/INTEGRATIONS.md section 23 names it separately, and an
 * adapter for a PACS that scopes series differently would widen it here.
 */
export type PacsSeriesLookup = PacsStudyLookup;

export interface PacsSeriesResult {
  seriesInstanceUid: string;
  seriesNumber: number | null;
  seriesDescription: string | null;
  modality: string | null;
  imageCount: number | null;
}

export interface PacsViewerRequest extends PacsStudyLookup {
  /** Who the session is for; adapters may scope or audit viewer access. */
  userId: string;
}

/**
 * The viewer handed to the client (API_CONTRACT section 36).
 *
 * `available: false` is a first-class answer, not an error to be smoothed
 * over: CLAUDE.md section 30 forbids faking successful viewer access when the
 * images are not there.
 */
export interface PacsViewerAccess {
  available: boolean;
  viewerUrl: string | null;
  /** ISO 8601. Null when the adapter issues no time-limited session. */
  expiresAt: string | null;
  studyInstanceUid: string | null;
  /** Why the viewer is unavailable, when it is. */
  reason?: string;
}

export interface PacsAvailabilityResult {
  status: PacsAvailability;
  studyInstanceUid: string | null;
  seriesCount: number | null;
  /** Set when status is ERROR, so the failure is not silently swallowed. */
  errorMessage?: string;
}

export interface PacsAdapter {
  findStudy(input: PacsStudyLookup): Promise<PacsStudyResult>;
  listSeries(input: PacsSeriesLookup): Promise<PacsSeriesResult[]>;
  getViewerAccess(input: PacsViewerRequest): Promise<PacsViewerAccess>;
  checkAvailability(input: PacsStudyLookup): Promise<PacsAvailabilityResult>;
}
