/** Source of truth: docs/DATA_MODEL.md section 17. */

export const PatientCategory = {
  ACIL: 'ACIL',
  YOGUN_BAKIM: 'YOGUN_BAKIM',
  YATAN: 'YATAN',
  NORMAL: 'NORMAL',
} as const;

export type PatientCategory = (typeof PatientCategory)[keyof typeof PatientCategory];

export const PATIENT_CATEGORIES: readonly PatientCategory[] = Object.values(PatientCategory);
