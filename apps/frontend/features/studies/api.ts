import {
  StudyPool,
  type DictationStatus,
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

/** GET /studies/:studyId/dictations sözleşmesinin mevcut backend cevabı. */
export interface StudyDictation {
  id: string;
  studyId: string;
  doctor: { id: string; displayName: string };
  status: DictationStatus;
  mimeType: string | null;
  fileSize: number | null;
  durationMs: number | null;
  startedAt: string;
  completedAt: string | null;
  uploadedAt: string | null;
  failureReason: string | null;
}

export interface StudyLockInfo {
  locked: boolean;
  ownerUserId: string | null;
  ownerDisplayName: string | null;
  ownerRole: string | null;
  lockedAt: string | null;
  expiresInSeconds: number | null;
}

export interface StartReadingResult {
  studyId: string;
  status: StudyStatus;
  lock: { ownerUserId: string; ownerRole: string; lockedAt: string; heartbeatIntervalSeconds: number };
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
  return getApiClient().get<StudyDictation[]>(`/studies/${studyId}/dictations`);
}

export function getStudyLock(studyId: string) {
  return getApiClient().get<StudyLockInfo>(`/studies/${studyId}/lock`);
}

export function startReading(studyId: string) {
  return getApiClient().post<StartReadingResult>(`/studies/${studyId}/start-reading`, undefined, { retryAfterRefresh: false });
}
