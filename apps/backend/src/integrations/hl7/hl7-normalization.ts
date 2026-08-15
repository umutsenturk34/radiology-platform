import { PATIENT_CATEGORIES, type PatientCategory } from '@radiology/shared';
import {
  Hl7InvalidMessageException,
  Hl7RequiredFieldMissingException,
} from '../contracts/integration.errors';
import type { NormalizedClinicalData } from '../contracts/hl7.contract';

/**
 * Validation and normalization shared by every HL7 adapter
 * (TASK_QUEUE BACKEND-010, "common validation").
 *
 * Keeping these here means a hospital-specific adapter only has to describe its
 * own field names and category codes, and cannot accidentally relax a rule the
 * internal model depends on.
 */

/** Collects missing required fields so the caller reports them all at once. */
export class RequiredFieldCollector {
  private readonly missing: string[] = [];

  require(path: string, value: unknown): string {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (normalized.length === 0) {
      this.missing.push(path);
    }
    return normalized;
  }

  assertComplete(): void {
    if (this.missing.length > 0) {
      throw new Hl7RequiredFieldMissingException(this.missing);
    }
  }
}

export function asRecord(payload: unknown, label = 'message'): Record<string, unknown> {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new Hl7InvalidMessageException(`The HL7 ${label} must be an object.`);
  }
  return payload as Record<string, unknown>;
}

export function nestedRecord(
  source: Record<string, unknown>,
  key: string,
  label: string,
): Record<string, unknown> {
  const value = source[key];
  if (value === undefined || value === null) {
    throw new Hl7RequiredFieldMissingException([label]);
  }
  return asRecord(value, label);
}

/** Trims a string field, returning undefined when it carries no content. */
export function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Normalizes a timestamp to ISO 8601.
 *
 * An unparseable timestamp is rejected rather than replaced with "now": a
 * wrong arrival time silently changes the SLA deadline.
 */
export function normalizeTimestamp(value: unknown, field: string): string {
  const raw = optionalString(value);
  if (!raw) {
    throw new Hl7RequiredFieldMissingException([field]);
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new Hl7InvalidMessageException(`${field} is not a valid ISO 8601 timestamp.`, { field });
  }

  return parsed.toISOString();
}

/** Same as `normalizeTimestamp` but the field may be absent. */
export function normalizeOptionalDate(value: unknown, field: string): string | undefined {
  const raw = optionalString(value);
  if (!raw) return undefined;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new Hl7InvalidMessageException(`${field} is not a valid date.`, { field });
  }

  return parsed.toISOString();
}

/**
 * Maps a hospital category code onto the internal enum
 * (docs/INTEGRATIONS.md section 14).
 *
 * Each adapter supplies its own lookup table. An unmapped code is an error:
 * guessing a category would change the SLA the study is measured against.
 */
export function normalizeCategory(
  value: unknown,
  mapping: Readonly<Record<string, PatientCategory>>,
): PatientCategory {
  const raw = optionalString(value);
  if (!raw) {
    throw new Hl7RequiredFieldMissingException(['study.category']);
  }

  const key = raw.toUpperCase();

  // An internal enum value is always accepted, so a hospital already speaking
  // the internal vocabulary needs no mapping entry.
  if ((PATIENT_CATEGORIES as readonly string[]).includes(key)) {
    return key as PatientCategory;
  }

  const mapped = mapping[key];
  if (!mapped) {
    throw new Hl7InvalidMessageException(`Unknown patient category code "${raw}".`, {
      field: 'study.category',
      received: raw,
      supported: [...PATIENT_CATEGORIES, ...Object.keys(mapping)],
    });
  }

  return mapped;
}

/** Internal clinical field names (docs/INTEGRATIONS.md section 15). */
const CLINICAL_FIELDS = [
  'preDiagnosis',
  'requestReason',
  'patientComplaint',
  'previousStudyInfo',
  'requestingPhysician',
  'department',
] as const;

/**
 * Splits a clinical payload into the known internal fields, keeping anything
 * else under `additionalData` so hospital-specific data is never dropped.
 */
export function normalizeClinicalData(value: unknown): NormalizedClinicalData | undefined {
  if (value === undefined || value === null) return undefined;

  const source = asRecord(value, 'clinicalData');
  const normalized: NormalizedClinicalData = {};

  for (const field of CLINICAL_FIELDS) {
    const text = optionalString(source[field]);
    if (text !== undefined) normalized[field] = text;
  }

  const extras: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(source)) {
    if ((CLINICAL_FIELDS as readonly string[]).includes(key)) continue;
    if (key === 'additionalData') {
      if (entry !== undefined && entry !== null) {
        Object.assign(extras, asRecord(entry, 'clinicalData.additionalData'));
      }
      continue;
    }
    extras[key] = entry;
  }

  if (Object.keys(extras).length > 0) {
    normalized.additionalData = extras;
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}
