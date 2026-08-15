import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';

/**
 * Integration error codes (docs/INTEGRATIONS.md section 17).
 *
 * Kept out of the shared `ApiErrorCode` enum on purpose: these are produced by
 * the pilot dev-tools ingestion endpoints, not by the clinical API the frontend
 * branches on. Promote one to `packages/shared` only together with an
 * API_CONTRACT update (AGENTS.md section 7).
 */
export const Hl7ErrorCode = {
  INVALID_MESSAGE: 'HL7_INVALID_MESSAGE',
  REQUIRED_FIELD_MISSING: 'HL7_REQUIRED_FIELD_MISSING',
  UNKNOWN_HOSPITAL: 'HL7_UNKNOWN_HOSPITAL',
  ACCESSION_CONFLICT: 'HL7_ACCESSION_CONFLICT',
  PATIENT_MISMATCH: 'HL7_PATIENT_MISMATCH',
  DUPLICATE: 'HL7_DUPLICATE',
  PROCESSING_FAILED: 'HL7_PROCESSING_FAILED',
} as const;

export type Hl7ErrorCode = (typeof Hl7ErrorCode)[keyof typeof Hl7ErrorCode];

/** 422 — the payload could not be normalized into an internal event. */
export class Hl7InvalidMessageException extends AppException {
  constructor(message: string, details?: Record<string, unknown>) {
    super(Hl7ErrorCode.INVALID_MESSAGE, message, HttpStatus.UNPROCESSABLE_ENTITY, details);
  }
}

/** 422 — a field the internal model requires was absent. */
export class Hl7RequiredFieldMissingException extends AppException {
  constructor(fields: string[]) {
    super(
      Hl7ErrorCode.REQUIRED_FIELD_MISSING,
      'The HL7 message is missing required fields.',
      HttpStatus.UNPROCESSABLE_ENTITY,
      { fields },
    );
  }
}

/** 404 — the message names a hospital this installation does not know. */
export class Hl7UnknownHospitalException extends AppException {
  constructor(details?: Record<string, unknown>) {
    super(
      Hl7ErrorCode.UNKNOWN_HOSPITAL,
      'The message references an unknown hospital.',
      HttpStatus.NOT_FOUND,
      details,
    );
  }
}

/** 404 — no study matches `hospitalId + accessionNumber`. */
export class Hl7AccessionConflictException extends AppException {
  constructor(message: string, details?: Record<string, unknown>) {
    super(Hl7ErrorCode.ACCESSION_CONFLICT, message, HttpStatus.CONFLICT, details);
  }
}

/**
 * 409 — the accession matched but a secondary patient identifier disagrees.
 *
 * Failing loudly is safer than attaching a study to the wrong patient
 * (docs/INTEGRATIONS.md section 11, CLAUDE.md section 16).
 */
export class Hl7PatientMismatchException extends AppException {
  constructor(details?: Record<string, unknown>) {
    super(
      Hl7ErrorCode.PATIENT_MISMATCH,
      'The accession number matched a study belonging to a different patient.',
      HttpStatus.CONFLICT,
      details,
    );
  }
}
