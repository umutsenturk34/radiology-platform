import { PatientCategory } from '@radiology/shared';
import {
  asRecord,
  nestedRecord,
  normalizeCategory,
  normalizeClinicalData,
  normalizeOptionalDate,
  normalizeTimestamp,
  optionalString,
  RequiredFieldCollector,
} from './hl7-normalization';
import { AppException } from '../../common/errors/app.exception';

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

describe('RequiredFieldCollector', () => {
  it('trims and returns present values', () => {
    const collector = new RequiredFieldCollector();

    expect(collector.require('a', '  value  ')).toBe('value');
    expect(() => collector.assertComplete()).not.toThrow();
  });

  it('reports every missing field at once instead of one per request', () => {
    const collector = new RequiredFieldCollector();
    collector.require('patient.externalPatientId', '');
    collector.require('study.accessionNumber', undefined);
    collector.require('study.modality', '   ');

    const error = expectError(() => collector.assertComplete(), 'HL7_REQUIRED_FIELD_MISSING');

    expect(error.details).toEqual({
      fields: ['patient.externalPatientId', 'study.accessionNumber', 'study.modality'],
    });
  });
});

describe('asRecord', () => {
  it('accepts a plain object', () => {
    expect(asRecord({ a: 1 })).toEqual({ a: 1 });
  });

  it.each([['a string', 'nope'], ['an array', [1, 2]], ['null', null], ['a number', 7]])(
    'rejects %s',
    (_label, value) => {
      expectError(() => asRecord(value), 'HL7_INVALID_MESSAGE');
    },
  );
});

describe('nestedRecord', () => {
  it('returns the nested object', () => {
    expect(nestedRecord({ patient: { id: 'x' } }, 'patient', 'patient')).toEqual({ id: 'x' });
  });

  it('reports an absent section as a missing required field', () => {
    const error = expectError(
      () => nestedRecord({}, 'patient', 'patient'),
      'HL7_REQUIRED_FIELD_MISSING',
    );

    expect(error.details).toEqual({ fields: ['patient'] });
  });
});

describe('optionalString', () => {
  it.each([
    ['  text  ', 'text'],
    ['', undefined],
    ['   ', undefined],
    [42, undefined],
    [undefined, undefined],
    [null, undefined],
  ])('normalizes %p', (input, expected) => {
    expect(optionalString(input)).toBe(expected);
  });
});

describe('normalizeTimestamp', () => {
  it('normalizes to ISO 8601 UTC', () => {
    expect(normalizeTimestamp('2026-08-15T10:00:00+03:00', 'receivedAt')).toBe(
      '2026-08-15T07:00:00.000Z',
    );
  });

  it('requires the field', () => {
    expectError(() => normalizeTimestamp(undefined, 'receivedAt'), 'HL7_REQUIRED_FIELD_MISSING');
  });

  it('refuses an unparseable value rather than substituting the current time', () => {
    // Substituting "now" would silently change the SLA deadline.
    expectError(() => normalizeTimestamp('yesterday', 'receivedAt'), 'HL7_INVALID_MESSAGE');
  });
});

describe('normalizeOptionalDate', () => {
  it('returns undefined when absent', () => {
    expect(normalizeOptionalDate(undefined, 'birthDate')).toBeUndefined();
    expect(normalizeOptionalDate('  ', 'birthDate')).toBeUndefined();
  });

  it('normalizes a present date', () => {
    expect(normalizeOptionalDate('1980-05-04', 'birthDate')).toBe('1980-05-04T00:00:00.000Z');
  });

  it('rejects an invalid date', () => {
    expectError(() => normalizeOptionalDate('not-a-date', 'birthDate'), 'HL7_INVALID_MESSAGE');
  });
});

describe('normalizeCategory', () => {
  const mapping = { E: PatientCategory.ACIL, EMERG: PatientCategory.ACIL, I: PatientCategory.YATAN };

  it('accepts an internal enum value directly', () => {
    expect(normalizeCategory('ACIL', {})).toBe(PatientCategory.ACIL);
    expect(normalizeCategory('yatan', {})).toBe(PatientCategory.YATAN);
  });

  it.each([
    ['E', PatientCategory.ACIL],
    ['emerg', PatientCategory.ACIL],
    ['I', PatientCategory.YATAN],
  ])('maps the hospital code %s', (code, expected) => {
    expect(normalizeCategory(code, mapping)).toBe(expected);
  });

  it('requires the field', () => {
    expectError(() => normalizeCategory(undefined, mapping), 'HL7_REQUIRED_FIELD_MISSING');
  });

  it('refuses an unmapped code instead of guessing a category', () => {
    // A guessed category would change which SLA the study is measured against.
    const error = expectError(() => normalizeCategory('XX', mapping), 'HL7_INVALID_MESSAGE');

    expect(error.details).toMatchObject({ field: 'study.category', received: 'XX' });
  });
});

describe('normalizeClinicalData', () => {
  it('returns undefined when there is nothing to carry', () => {
    expect(normalizeClinicalData(undefined)).toBeUndefined();
    expect(normalizeClinicalData(null)).toBeUndefined();
    expect(normalizeClinicalData({})).toBeUndefined();
    expect(normalizeClinicalData({ preDiagnosis: '   ' })).toBeUndefined();
  });

  it('keeps the documented internal fields', () => {
    expect(
      normalizeClinicalData({
        preDiagnosis: ' Pnomoni ',
        requestReason: 'Kontrol',
        patientComplaint: 'Oksuruk',
        previousStudyInfo: 'Yok',
        requestingPhysician: 'Dr. Test',
        department: 'Acil',
      }),
    ).toEqual({
      preDiagnosis: 'Pnomoni',
      requestReason: 'Kontrol',
      patientComplaint: 'Oksuruk',
      previousStudyInfo: 'Yok',
      requestingPhysician: 'Dr. Test',
      department: 'Acil',
    });
  });

  it('moves unknown hospital fields into additionalData rather than dropping them', () => {
    expect(
      normalizeClinicalData({ preDiagnosis: 'Pnomoni', hospitalSpecificCode: 'X-91' }),
    ).toEqual({
      preDiagnosis: 'Pnomoni',
      additionalData: { hospitalSpecificCode: 'X-91' },
    });
  });

  it('merges an explicit additionalData block', () => {
    expect(
      normalizeClinicalData({
        department: 'Acil',
        additionalData: { ward: '3A' },
        vendorFlag: true,
      }),
    ).toEqual({
      department: 'Acil',
      additionalData: { ward: '3A', vendorFlag: true },
    });
  });

  it('rejects a non-object clinical block', () => {
    expectError(() => normalizeClinicalData('free text'), 'HL7_INVALID_MESSAGE');
  });
});
