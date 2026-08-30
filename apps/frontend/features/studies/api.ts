import {
  StudyPool,
  type AcquiredLockInfo,
  DICTATION_UPLOAD_FIELD,
  type DictationDto,
  type InformationNoteDto,
  type StudyLockInfo,
  type StudyPacsSeries,
  type StudyPacsViewer,
  type StudyDetail,
  type StudyListItem,
  type StudyListQuery,
  type StudyStatus,
} from "@radiology/shared";

import { getApiClient } from "@/lib/api";

export type { StudyDetail, StudyListItem } from "@radiology/shared";

export type DoctorStudiesQuery = Pick<StudyListQuery, "category" | "hospitalId" | "status" | "search"> & {
  page: number;
};

export interface StartReadingResult {
  studyId: string;
  status: StudyStatus;
  lock: AcquiredLockInfo;
  readingStartedAt: string;
}

export function listDoctorStudies(query: DoctorStudiesQuery) {
  const params = new URLSearchParams({
    pool: StudyPool.UNREAD,
    page: String(query.page),
    pageSize: "25",
    sortBy: "arrivalAt",
    sortOrder: "asc",
  });

  if (query.category) params.set("category", query.category);
  if (query.hospitalId) params.set("hospitalId", query.hospitalId);
  if (query.status) params.set("status", query.status);
  if (query.search?.trim()) params.set("search", query.search.trim());

  return getApiClient().getPaginated<StudyListItem>(`/studies?${params.toString()}`);
}

export function getStudyDetail(studyId: string) {
  return getApiClient().get<StudyDetail>(`/studies/${studyId}`);
}

export function listStudyDictations(studyId: string) {
  return getApiClient().get<DictationDto[]>(`/studies/${studyId}/dictations`);
}

export function createStudyDictation(studyId: string, mimeType: string) {
  return getApiClient().post<DictationDto>(`/studies/${studyId}/dictations`, { mimeType });
}

export function uploadStudyDictation(dictationId: string, audio: Blob, durationMs: number) {
  const form = new FormData();
  form.append(DICTATION_UPLOAD_FIELD.FILE, audio, "dictation.webm");
  form.append(DICTATION_UPLOAD_FIELD.DURATION_MS, String(durationMs));
  return getApiClient().postForm<DictationDto>(`/dictations/${dictationId}/upload`, form);
}

export function getStudyLock(studyId: string) {
  return getApiClient().get<StudyLockInfo>(`/studies/${studyId}/lock`);
}

export function getStudyPacsViewer(studyId: string) {
  return getApiClient().get<StudyPacsViewer>(`/studies/${studyId}/pacs/viewer`);
}

export function listStudyPacsSeries(studyId: string) {
  return getApiClient().get<StudyPacsSeries[]>(`/studies/${studyId}/pacs/series`);
}

export function listStudyInformation(studyId: string) {
  return getApiClient().get<InformationNoteDto[]>(`/studies/${studyId}/information`);
}

export function startReading(studyId: string) {
  return getApiClient().post<StartReadingResult>(`/studies/${studyId}/start-reading`, undefined, { retryAfterRefresh: false });
}
