import { Injectable } from '@nestjs/common';
import { PatientCategory } from '@radiology/shared';
import {
  Hl7EventType,
  type Hl7Adapter,
  type Hl7AdapterContext,
  type NormalizedHl7FirstEvent,
  type NormalizedHl7SecondEvent,
} from '../contracts/hl7.contract';
import {
  asRecord,
  normalizeCategory,
  normalizeClinicalData,
  normalizeOptionalDate,
  normalizeTimestamp,
  optionalString,
  RequiredFieldCollector,
} from './hl7-normalization';

/**
 * Category codes this adapter understands in addition to the internal enum
 * (docs/INTEGRATIONS.md section 14).
 *
 * Real hospital code tables belong to their own adapters; these exist so the
 * pilot can exercise the mapping path at all.
 */
const CATEGORY_CODES: Readonly<Record<string, PatientCategory>> = {
  E: PatientCategory.ACIL,
  EMERG: PatientCategory.ACIL,
  EMERGENCY: PatientCategory.ACIL,
  ICU: PatientCategory.YOGUN_BAKIM,
  I: PatientCategory.YATAN,
  INPATIENT: PatientCategory.YATAN,
  O: PatientCategory.NORMAL,
  OUTPATIENT: PatientCategory.NORMAL,
};

/**
 * Pilot HL7 adapter (TASK_QUEUE BACKEND-011, docs/INTEGRATIONS.md section 18).
 *
 * It accepts the simple JSON body the dev-tools endpoints post and produces the
 * same normalized events a real hospital adapter would. The application service
 * behind it is the production one — dev tools do not get a shortcut into the
 * workflow (docs/WORKFLOW_STATE_MACHINE.md section 47).
 *
 * Pure translation: no database access, no state.
 */
@Injectable()
export class MockHl7Adapter implements Hl7Adapter {
  readonly name = 'MockHl7Adapter';

  parseFirstEvent(payload: unknown, context: Hl7AdapterContext): NormalizedHl7FirstEvent {
    const message = asRecord(payload, 'first message');
    const fields = new RequiredFieldCollector();

    const externalPatientId = fields.require('externalPatientId', message.externalPatientId);
    const accessionNumber = fields.require('accessionNumber', message.accessionNumber);
    fields.assertComplete();

    const { firstName, lastName } = splitPatientName(message);

    return {
      eventType: Hl7EventType.FIRST_ORDER,
      hospitalId: context.hospitalId,
      externalMessageId: optionalString(message.externalMessageId),
      patient: {
        externalPatientId,
        firstName,
        lastName,
        birthDate: normalizeOptionalDate(message.birthDate, 'birthDate'),
        gender: optionalString(message.gender),
      },
      study: {
        accessionNumber,
        externalOrderId: optionalString(message.externalOrderId),
        externalProtocolId: optionalString(message.externalProtocolId),
        studyDescription: optionalString(message.studyDescription),
        modality: optionalString(message.modality),
        category: normalizeCategory(message.category, CATEGORY_CODES),
      },
      clinicalData: normalizeClinicalData(message.clinicalData),
      receivedAt: message.receivedAt
        ? normalizeTimestamp(message.receivedAt, 'receivedAt')
        : new Date().toISOString(),
    };
  }

  parseSecondEvent(payload: unknown, context: Hl7AdapterContext): NormalizedHl7SecondEvent {
    const message = asRecord(payload, 'second message');
    const fields = new RequiredFieldCollector();

    const accessionNumber = fields.require('accessionNumber', message.accessionNumber);
    fields.assertComplete();

    return {
      eventType: Hl7EventType.STUDY_ACCEPTED,
      hospitalId: context.hospitalId,
      externalMessageId: optionalString(message.externalMessageId),
      externalPatientId: optionalString(message.externalPatientId),
      accessionNumber,
      acceptedAt: message.acceptedAt
        ? normalizeTimestamp(message.acceptedAt, 'acceptedAt')
        : new Date().toISOString(),
      clinicalData: normalizeClinicalData(message.clinicalData),
    };
  }
}

/**
 * The pilot payload carries a single `patientName`; explicit `firstName` /
 * `lastName` win when supplied. A single-word name becomes the surname, since
 * lists and reports are ordered by it.
 */
function splitPatientName(message: Record<string, unknown>): {
  firstName?: string;
  lastName?: string;
} {
  const firstName = optionalString(message.firstName);
  const lastName = optionalString(message.lastName);
  if (firstName || lastName) return { firstName, lastName };

  const fullName = optionalString(message.patientName);
  if (!fullName) return {};

  const parts = fullName.split(/\s+/);
  if (parts.length === 1) return { lastName: parts[0] };

  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
}
