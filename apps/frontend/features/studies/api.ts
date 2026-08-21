import { type PatientCategory, type StudyStatus } from "@radiology/shared";

import { getApiClient } from "@/lib/api";

/** Mirrors the currently deployed GET /studies response contract. */
export interface StudyListItem {
  id: string;
  accessionNumber: string;
  patient: { id: string; displayName: string; externalPatientId: string };
  hospital: { id: string; code: string; shortName: string | null };
  studyDescription: string | null;
  modality: string | null;
  category: PatientCategory;
  status: StudyStatus;
  arrivalAt: string | null;
  sla: { deadlineAt: string | null };
}

export interface DoctorStudiesQuery {
  category?: PatientCategory;
  hospitalId?: string;
  status?: StudyStatus;
  search?: string;
  page: number;
}

export interface StudyDetail {
  id: string;
  accessionNumber: string;
  status: StudyStatus;
  category: PatientCategory;
  patient: { id: string; displayName: string; externalPatientId: string; birthDate: string | null; gender: string | null };
  hospital: { id: string; code: string; name: string };
  study: { description: string | null; modality: string | null; studyInstanceUid: string | null; externalOrderId: string | null; externalProtocolId: string | null };
  arrivalAt: string | null;
  sla: { deadlineAt: string | null };
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
    pool: "UNREAD",
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

export function getStudyLock(studyId: string) {
  return getApiClient().get<StudyLockInfo>(`/studies/${studyId}/lock`);
}

export function startReading(studyId: string) {
  return getApiClient().post<StartReadingResult>(`/studies/${studyId}/start-reading`, undefined, { retryAfterRefresh: false });
}
