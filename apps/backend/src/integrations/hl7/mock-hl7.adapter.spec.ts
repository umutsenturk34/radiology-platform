import { PatientCategory } from '@radiology/shared';
import { MockHl7Adapter } from './mock-hl7.adapter';
import { AppException } from '../../common/errors/app.exception';

const HOSPITAL_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const context = { hospitalId: HOSPITAL_ID };

const adapter = new MockHl7Adapter();

function expectError(fn: () => unknown, code: string): AppException {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).code).toBe(code);
    return error as AppException;
  }
  throw new Error(`Expected ${code}`);
}

describe('MockHl7Adapter.parseFirstEvent', () => {
  const validPayload = {
    hospitalId: HOSPITAL_ID,
    externalPatientId: 'TEST-001',
    patientName: 'Test Patient 001',
    accessionNumber: 'TEST-ACC-001',
    studyDescription: 'BT Toraks',
    modality: 'CT',
    category: 'ACIL',
  };

  it('normalizes the documented dev-tools payload', () => {
    const event = adapter.parseFirstEvent(validPayload, context);

    expect(event).toMatchObject({
      eventType: 'FIRST_ORDER',
      hospitalId: HOSPITAL_ID,
      patient: { externalPatientId: 'TEST-001', firstName: 'Test Patient', lastName: '001' },
      study: {
        accessionNumber: 'TEST-ACC-001',
        studyDescription: 'BT Toraks',
        modality: 'CT',
        category: PatientCategory.ACIL,
      },
    });
    expect(event.receivedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('takes the hospital id from the context, not the payload', () => {
    const event = adapter.parseFirstEvent(
      { ...validPayload, hospitalId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' },
      context,
    );

    expect(event.hospitalId).toBe(HOSPITAL_ID);
  });

  it('prefers explicit first and last names', () => {
    const event = adapter.parseFirstEvent(
      { ...validPayload, firstName: 'Ayse', lastName: 'Yilmaz' },
      context,
    );

    expect(event.patient).toMatchObject({ firstName: 'Ayse', lastName: 'Yilmaz' });
  });

  it('treats a single-word name as the surname', () => {
    const event = adapter.parseFirstEvent({ ...validPayload, patientName: 'Yilmaz' }, context);

    expect(event.patient).toMatchObject({ lastName: 'Yilmaz', firstName: undefined });
  });

  it('maps a hospital category code onto the internal enum', () => {
    expect(adapter.parseFirstEvent({ ...validPayload, category: 'EMERG' }, context).study.category)
      .toBe(PatientCategory.ACIL);
    expect(adapter.parseFirstEvent({ ...validPayload, category: 'icu' }, context).study.category)
      .toBe(PatientCategory.YOGUN_BAKIM);
  });

  it('reports missing required fields together', () => {
    const error = expectError(
      () => adapter.parseFirstEvent({ category: 'ACIL' }, context),
      'HL7_REQUIRED_FIELD_MISSING',
    );

    expect(error.details).toEqual({ fields: ['externalPatientId', 'accessionNumber'] });
  });

  it('rejects an unknown category rather than defaulting', () => {
    expectError(
      () => adapter.parseFirstEvent({ ...validPayload, category: 'PRIORITY-9' }, context),
      'HL7_INVALID_MESSAGE',
    );
  });

  it('keeps a supplied receivedAt instead of stamping now', () => {
    const event = adapter.parseFirstEvent(
      { ...validPayload, receivedAt: '2026-08-15T09:30:00.000Z' },
      context,
    );

    expect(event.receivedAt).toBe('2026-08-15T09:30:00.000Z');
  });

  it('normalizes clinical data and preserves hospital-specific extras', () => {
    const event = adapter.parseFirstEvent(
      {
        ...validPayload,
        clinicalData: { preDiagnosis: 'Pnomoni', hospitalField: 'X' },
      },
      context,
    );

    expect(event.clinicalData).toEqual({
      preDiagnosis: 'Pnomoni',
      additionalData: { hospitalField: 'X' },
    });
  });

  it('rejects a non-object payload', () => {
    expectError(() => adapter.parseFirstEvent('MSH|^~\\&|', context), 'HL7_INVALID_MESSAGE');
  });

  it('reads no state and returns a plain object', () => {
    // The adapter is pure translation: same input, same output.
    const first = adapter.parseFirstEvent({ ...validPayload, receivedAt: '2026-08-15T09:30:00Z' }, context); // prettier-ignore
    const second = adapter.parseFirstEvent({ ...validPayload, receivedAt: '2026-08-15T09:30:00Z' }, context); // prettier-ignore

    expect(first).toEqual(second);
  });
});

describe('MockHl7Adapter.parseSecondEvent', () => {
  it('normalizes the documented payload', () => {
    const event = adapter.parseSecondEvent(
      { hospitalId: HOSPITAL_ID, externalPatientId: 'TEST-001', accessionNumber: 'TEST-ACC-001' },
      context,
    );

    expect(event).toMatchObject({
      eventType: 'STUDY_ACCEPTED',
      hospitalId: HOSPITAL_ID,
      externalPatientId: 'TEST-001',
      accessionNumber: 'TEST-ACC-001',
    });
  });

  it('requires the accession number, which is the matching key', () => {
    const error = expectError(
      () => adapter.parseSecondEvent({ externalPatientId: 'TEST-001' }, context),
      'HL7_REQUIRED_FIELD_MISSING',
    );

    expect(error.details).toEqual({ fields: ['accessionNumber'] });
  });

  it('leaves the patient identifier optional', () => {
    const event = adapter.parseSecondEvent({ accessionNumber: 'TEST-ACC-001' }, context);

    expect(event.externalPatientId).toBeUndefined();
  });

  it('rejects an unparseable acceptedAt', () => {
    expectError(
      () => adapter.parseSecondEvent({ accessionNumber: 'A', acceptedAt: 'soon' }, context),
      'HL7_INVALID_MESSAGE',
    );
  });
});
