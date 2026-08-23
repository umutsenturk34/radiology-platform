/**
 * PACS read contracts (docs/API_CONTRACT.md sections 36 and 37).
 *
 * The client receives a viewer reference and metadata, never PACS credentials
 * — the frontend must not generate PACS secrets of its own (section 36).
 */

export interface StudyPacsViewer {
  available: boolean;
  /** Null whenever `available` is false; there is no viewer to open. */
  viewerUrl: string | null;
  /** ISO 8601, or null when the session does not expire. */
  expiresAt: string | null;
  studyInstanceUid: string | null;
  /**
   * Why the viewer is unavailable, so the client can distinguish "images are
   * still arriving" from "the integration is broken" instead of showing one
   * generic error.
   */
  reason?: string;
}

export interface StudyPacsSeries {
  seriesInstanceUid: string;
  seriesNumber: number | null;
  seriesDescription: string | null;
  modality: string | null;
  imageCount: number | null;
}
