import { PatientCategory, StudyStatus } from '@radiology/shared';
import { Hl7Service } from './hl7.service';
import { WorkflowService } from '../../workflow/workflow.service';
import { AuditService } from '../../audit/audit.service';
import { AppLogger } from '../../common/logging/app-logger.service';
import { AppException } from '../../common/errors/app.exception';
import { Hl7EventType } from '../contracts/hl7.contract';
import type { PrismaService } from '../../prisma/prisma.service';
import type {
  NormalizedHl7FirstEvent,
  NormalizedHl7SecondEvent,
} from '../contracts/hl7.contract';

const HOSPITAL_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_HOSPITAL_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

interface Row {
  [key: string]: unknown;
}

/**
 * In-memory stand-in for the tables the HL7 chain touches.
 *
 * The real WorkflowService and AuditService run against it, so these tests
 * cover the whole chain — normalization, persistence, transition, history and
 * audit — without connecting to the shared pilot database.
 */
function createFakePrisma() {
  const hospitals: Row[] = [{ id: HOSPITAL_ID, code: 'TEST_HOSPITAL' }];
  const patients: Row[] = [];
  const studies: Row[] = [];
  const slaPolicies: Row[] = [
    { id: 'sla-acil', category: PatientCategory.ACIL, durationMinutes: 120, active: true },
    { id: 'sla-normal', category: PatientCategory.NORMAL, durationMinutes: 1440, active: true },
  ];
  const history: Row[] = [];
  const auditLogs: Row[] = [];

  let sequence = 0;
  const nextId = (prefix: string) => `${prefix}-${++sequence}`;

  const client = {
    hospital: {
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(hospitals.find((row) => row.id === where.id) ?? null),
    },
    patient: {
      findUnique: ({ where }: { where: Row }) => {
        const key = where.hospitalId_externalPatientId as Row | undefined;
        if (!key) return Promise.resolve(null);
        return Promise.resolve(
          patients.find(
            (row) =>
              row.hospitalId === key.hospitalId &&
              row.externalPatientId === key.externalPatientId,
          ) ?? null,
        );
      },
      create: ({ data }: { data: Row }) => {
        const row = { id: nextId('patient'), ...data };
        patients.push(row);
        return Promise.resolve(row);
      },
    },
    study: {
      findUnique: ({ where }: { where: Row }) => {
        if (typeof where.id === 'string') {
          return Promise.resolve(studies.find((row) => row.id === where.id) ?? null);
        }
        const key = where.hospitalId_accessionNumber as Row | undefined;
        if (!key) return Promise.resolve(null);
        const found = studies.find(
          (row) =>
            row.hospitalId === key.hospitalId && row.accessionNumber === key.accessionNumber,
        );
        if (!found) return Promise.resolve(null);
        return Promise.resolve({
          ...found,
          patient: patients.find((row) => row.id === found.patientId),
        });
      },
      findUniqueOrThrow: ({ where }: { where: Row }) => {
        const key = where.hospitalId_accessionNumber as Row;
        const found = studies.find(
          (row) =>
            row.hospitalId === key.hospitalId && row.accessionNumber === key.accessionNumber,
        );
        if (!found) throw new Error('study not found');
        return Promise.resolve(found);
      },
      create: ({ data }: { data: Row }) => {
        const duplicate = studies.some(
          (row) =>
            row.hospitalId === data.hospitalId && row.accessionNumber === data.accessionNumber,
        );
        if (duplicate) throw new Error('unique constraint');
        const row = { id: nextId('study'), ...data };
        studies.push(row);
        return Promise.resolve(row);
      },
      update: ({ where, data }: { where: { id: string }; data: Row }) => {
        const row = studies.find((candidate) => candidate.id === where.id);
        if (!row) throw new Error('study not found');
        Object.assign(row, data);
        return Promise.resolve(row);
      },
    },
    slaPolicy: {
      findFirst: ({ where }: { where: Row }) =>
        Promise.resolve(
          slaPolicies.find(
            (row) => row.category === where.category && row.active === where.active,
          ) ?? null,
        ),
    },
    studyStatusHistory: {
      create: ({ data }: { data: Row }) => {
        history.push(data);
        return Promise.resolve(data);
      },
    },
    auditLog: {
      create: ({ data }: { data: Row }) => {
        auditLogs.push(data);
        return Promise.resolve(data);
      },
    },
  };

  const prisma = {
    ...client,
    $transaction: (callback: (tx: unknown) => Promise<unknown>) => callback(client),
  };

  return { prisma: prisma as unknown as PrismaService, patients, studies, history, auditLogs };
}

function createService() {
  const fake = createFakePrisma();
  const logger = new AppLogger('error');
  const audit = new AuditService(fake.prisma);
  const workflow = new WorkflowService(fake.prisma, audit, logger);

  return { ...fake, service: new Hl7Service(fake.prisma, workflow, audit, logger) };
}

function firstEvent(overrides: Partial<NormalizedHl7FirstEvent> = {}): NormalizedHl7FirstEvent {
  return {
    eventType: Hl7EventType.FIRST_ORDER,
    hospitalId: HOSPITAL_ID,
    externalMessageId: 'MSG-1',
    patient: {
      externalPatientId: 'TEST-001',
      firstName: 'Test',
      lastName: 'Hasta',
    },
    study: {
      accessionNumber: 'ACC-001',
      studyDescription: 'BT Toraks',
      modality: 'CT',
      category: PatientCategory.ACIL,
    },
    receivedAt: '2026-08-15T08:00:00.000Z',
    ...overrides,
  };
}

function secondEvent(overrides: Partial<NormalizedHl7SecondEvent> = {}): NormalizedHl7SecondEvent {
  return {
    eventType: Hl7EventType.STUDY_ACCEPTED,
    hospitalId: HOSPITAL_ID,
    accessionNumber: 'ACC-001',
    acceptedAt: '2026-08-15T09:00:00.000Z',
    ...overrides,
  };
}

async function expectAppError(promise: Promise<unknown>, code: string): Promise<AppException> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).code).toBe(code);
    return error as AppException;
  }
  throw new Error(`Expected the call to reject with ${code}`);
}

const eventTypes = (rows: Row[]): string[] => rows.map((row) => row.eventType as string);

describe('Hl7Service.processFirstEvent', () => {
  it('creates the patient and study and lands on WAITING_ACCEPTANCE', async () => {
    const { service, patients, studies } = createService();

    const result = await service.processFirstEvent(firstEvent());

    expect(result).toMatchObject({ duplicate: false, status: StudyStatus.WAITING_ACCEPTANCE });
    expect(patients).toHaveLength(1);
    expect(patients[0]).toMatchObject({ externalPatientId: 'TEST-001', lastName: 'Hasta' });
    expect(studies).toHaveLength(1);
    expect(studies[0]).toMatchObject({
      accessionNumber: 'ACC-001',
      category: PatientCategory.ACIL,
      status: StudyStatus.WAITING_ACCEPTANCE,
    });
  });

  it('does not start the SLA clock at the order', async () => {
    // The clock starts at the second HL7 (WORKFLOW_STATE_MACHINE section 60).
    const { service, studies } = createService();

    await service.processFirstEvent(firstEvent());

    expect(studies[0].arrivalAt).toBeUndefined();
    expect(studies[0].slaDeadlineAt).toBeUndefined();
    expect(studies[0].firstHl7ReceivedAt).toEqual(new Date('2026-08-15T08:00:00.000Z'));
  });

  it('writes the documented audit chain', async () => {
    const { service, auditLogs } = createService();

    await service.processFirstEvent(firstEvent());

    expect(eventTypes(auditLogs)).toEqual([
      'PATIENT_CREATED',
      'HL7_FIRST_RECEIVED',
      'STUDY_CREATED',
      'STUDY_STATUS_CHANGED',
    ]);
  });

  it('records the status transition in history', async () => {
    const { service, history } = createService();

    await service.processFirstEvent(firstEvent());

    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      fromStatus: StudyStatus.INITIAL,
      toStatus: StudyStatus.WAITING_ACCEPTANCE,
    });
  });

  it('keeps the normalized clinical data in the audit trail', async () => {
    const { service, auditLogs } = createService();

    await service.processFirstEvent(
      firstEvent({ clinicalData: { preDiagnosis: 'Pnomoni' } }),
    );

    const received = auditLogs.find((row) => row.eventType === 'HL7_FIRST_RECEIVED');
    expect(received?.metadata).toMatchObject({ clinicalData: { preDiagnosis: 'Pnomoni' } });
  });

  it('is idempotent: a repeated message creates no second study or patient', async () => {
    const { service, patients, studies } = createService();

    const first = await service.processFirstEvent(firstEvent());
    const repeat = await service.processFirstEvent(firstEvent());

    expect(repeat).toMatchObject({ studyId: first.studyId, duplicate: true });
    expect(patients).toHaveLength(1);
    expect(studies).toHaveLength(1);
  });

  it('does not reset the workflow state when a duplicate arrives later', async () => {
    const { service, studies, history } = createService();

    await service.processFirstEvent(firstEvent());
    await service.processSecondEvent(secondEvent());
    const historyLength = history.length;

    const repeat = await service.processFirstEvent(firstEvent());

    expect(repeat.duplicate).toBe(true);
    expect(studies[0].status).toBe(StudyStatus.IMAGES_PENDING);
    expect(history).toHaveLength(historyLength);
  });

  it('audits an ignored duplicate rather than failing silently', async () => {
    const { service, auditLogs } = createService();

    await service.processFirstEvent(firstEvent());
    await service.processFirstEvent(firstEvent());

    expect(eventTypes(auditLogs)).toContain('HL7_DUPLICATE_IGNORED');
  });

  it('creates a separate study for the same accession in another hospital', async () => {
    // Accession numbers are unique per hospital only (DATA_MODEL section 16).
    const { service, studies } = createService();

    await service.processFirstEvent(firstEvent());
    await expectAppError(
      service.processFirstEvent(firstEvent({ hospitalId: OTHER_HOSPITAL_ID })),
      'HL7_UNKNOWN_HOSPITAL',
    );

    expect(studies).toHaveLength(1);
  });

  it('reuses an existing patient for a second study', async () => {
    const { service, patients, studies } = createService();

    await service.processFirstEvent(firstEvent());
    await service.processFirstEvent(
      firstEvent({ study: { accessionNumber: 'ACC-002', category: PatientCategory.NORMAL } }),
    );

    expect(patients).toHaveLength(1);
    expect(studies).toHaveLength(2);
    expect(studies[1].patientId).toBe(studies[0].patientId);
  });

  it('refuses an unknown hospital', async () => {
    const { service } = createService();

    await expectAppError(
      service.processFirstEvent(firstEvent({ hospitalId: OTHER_HOSPITAL_ID })),
      'HL7_UNKNOWN_HOSPITAL',
    );
  });
});

describe('Hl7Service.processSecondEvent', () => {
  async function withFirstProcessed() {
    const context = createService();
    await context.service.processFirstEvent(firstEvent());
    return context;
  }

  it('matches on hospital and accession, then moves to IMAGES_PENDING', async () => {
    const { service, studies } = await withFirstProcessed();

    const result = await service.processSecondEvent(secondEvent());

    expect(result).toMatchObject({ duplicate: false, status: StudyStatus.IMAGES_PENDING });
    expect(studies[0].status).toBe(StudyStatus.IMAGES_PENDING);
    expect(studies[0].secondHl7ReceivedAt).toEqual(new Date('2026-08-15T09:00:00.000Z'));
  });

  it('starts the SLA clock and freezes the deadline from the active policy', async () => {
    const { service, studies } = await withFirstProcessed();

    const result = await service.processSecondEvent(secondEvent());

    // ACIL = 120 minutes after arrival.
    expect(result.arrivalAt).toBe('2026-08-15T09:00:00.000Z');
    expect(result.slaDeadlineAt).toBe('2026-08-15T11:00:00.000Z');
    expect(studies[0].arrivalAt).toEqual(new Date('2026-08-15T09:00:00.000Z'));
  });

  it('leaves the deadline unset when no policy exists for the category', async () => {
    // YOGUN_BAKIM has no defined duration (BLOCKED_SPEC); inventing one would
    // measure the study against a made-up SLA.
    const context = createService();
    await context.service.processFirstEvent(
      firstEvent({
        study: { accessionNumber: 'ACC-ICU', category: PatientCategory.YOGUN_BAKIM },
      }),
    );

    const result = await context.service.processSecondEvent(
      secondEvent({ accessionNumber: 'ACC-ICU' }),
    );

    expect(result.slaDeadlineAt).toBeNull();
    expect(result.status).toBe(StudyStatus.IMAGES_PENDING);
  });

  it('refuses an accession number that matches no study', async () => {
    const { service } = await withFirstProcessed();

    const error = await expectAppError(
      service.processSecondEvent(secondEvent({ accessionNumber: 'ACC-UNKNOWN' })),
      'HL7_ACCESSION_CONFLICT',
    );

    expect(error.getStatus()).toBe(409);
  });

  it('refuses a patient mismatch instead of attaching the wrong patient', async () => {
    const { service, studies, auditLogs } = await withFirstProcessed();

    const error = await expectAppError(
      service.processSecondEvent(secondEvent({ externalPatientId: 'SOMEONE-ELSE' })),
      'HL7_PATIENT_MISMATCH',
    );

    expect(error.getStatus()).toBe(409);
    expect(studies[0].status).toBe(StudyStatus.WAITING_ACCEPTANCE);
    expect(eventTypes(auditLogs)).toContain('HL7_PATIENT_MISMATCH');
  });

  it('accepts a matching patient identifier', async () => {
    const { service } = await withFirstProcessed();

    await expect(
      service.processSecondEvent(secondEvent({ externalPatientId: 'TEST-001' })),
    ).resolves.toMatchObject({ status: StudyStatus.IMAGES_PENDING });
  });

  it('does not rewind an already accepted study', async () => {
    const { service, studies, history } = await withFirstProcessed();

    await service.processSecondEvent(secondEvent());
    const historyLength = history.length;

    const repeat = await service.processSecondEvent(secondEvent());

    expect(repeat.duplicate).toBe(true);
    expect(studies[0].status).toBe(StudyStatus.IMAGES_PENDING);
    expect(history).toHaveLength(historyLength);
  });

  it('keeps the original arrival time on a duplicate', async () => {
    const { service } = await withFirstProcessed();

    await service.processSecondEvent(secondEvent());
    const repeat = await service.processSecondEvent(
      secondEvent({ acceptedAt: '2026-08-15T23:00:00.000Z' }),
    );

    // A late duplicate must not extend the SLA.
    expect(repeat.arrivalAt).toBe('2026-08-15T09:00:00.000Z');
  });

  it('writes the second-received audit entry', async () => {
    const { service, auditLogs } = await withFirstProcessed();

    await service.processSecondEvent(secondEvent());

    expect(eventTypes(auditLogs)).toContain('HL7_SECOND_RECEIVED');
  });

  it('refuses an unknown hospital', async () => {
    const { service } = await withFirstProcessed();

    await expectAppError(
      service.processSecondEvent(secondEvent({ hospitalId: OTHER_HOSPITAL_ID })),
      'HL7_UNKNOWN_HOSPITAL',
    );
  });
});
