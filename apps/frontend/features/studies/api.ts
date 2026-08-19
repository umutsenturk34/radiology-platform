import { type PatientCategory, type StudyStatus } from "@radiology/shared";

import { getApiClient } from "@/lib/api";

export interface StudyListItem {
  id: string;
  accessionNumber: string;
  patient: { id: string; displayName: string; externalPatientId: string };
  hospital: { id: string; code: string; shortName: string };
  studyDescription: string;
  modality: string | null;
  category: PatientCategory;
  status: StudyStatus;
  arrivalAt: string;
  sla: { deadlineAt: string | null; remainingSeconds?: number; overdueSeconds?: number; state: string } | null;
}

export function listDoctorStudies() {
  return getApiClient().getPaginated<StudyListItem>("/studies?pool=UNREAD&page=1&pageSize=25&sortBy=arrivalAt&sortOrder=asc");
}
