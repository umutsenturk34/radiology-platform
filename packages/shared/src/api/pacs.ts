/** PACS references and metadata only; credentials are never exposed to clients. */
export interface StudyPacsViewer {
  available: boolean;
  viewerUrl: string | null;
  expiresAt: string | null;
  studyInstanceUid: string | null;
  reason?: string;
}

export interface StudyPacsSeries {
  seriesInstanceUid: string;
  seriesNumber: number | null;
  seriesDescription: string | null;
  modality: string | null;
  imageCount: number | null;
}
