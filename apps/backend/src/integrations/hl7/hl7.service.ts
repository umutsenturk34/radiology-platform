import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PatientCategory, StudyStatus } from '@radiology/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkflowService } from '../../workflow/workflow.service';
import { AuditService } from '../../audit/audit.service';
import { AuditEventType } from '../../audit/audit.types';
import { AppLogger } from '../../common/logging/app-logger.service';
import {
  Hl7AccessionConflictException,
  Hl7PatientMismatchException,
  Hl7UnknownHospitalException,
} from '../contracts/integration.errors';
import type {
  NormalizedHl7FirstEvent,
  NormalizedHl7SecondEvent,
} from '../contracts/hl7.contract';

/** Prisma's unique-constraint violation. */
const UNIQUE_VIOLATION = 'P2002';

export interface Hl7FirstResult {
  studyId: string;
  patientId: string;
  status: StudyStatus;
  /** True when the message had already been processed and nothing changed. */
  duplicate: boolean;
}

export interface Hl7SecondResult {
  studyId: string;
  status: StudyStatus;
  arrivalAt: string | null;
  slaDeadlineAt: string | null;
  duplicate: boolean;
}

/**
 * Core HL7 processing (TASK_QUEUE BACKEND-011 and BACKEND-012).
 *
 * Takes only normalized events, so it is identical for the pilot mock and for a
 * real hospital adapter (docs/INTEGRATIONS.md sections 5 and 18). Status changes
 * go through `WorkflowService`; this service never writes `status` itself.
 */
@Injectable()
export class Hl7Service {
  private readonly logger: AppLogger;

  constructor(
    private readonly prisma: PrismaService,
    private readonly workflow: WorkflowService,
    private readonly audit: AuditService,
    logger: AppLogger,
  ) {
    this.logger = logger.child(Hl7Service.name);
  }

  /**
   * First message: create the patient and study, then move the study to
   * WAITING_ACCEPTANCE (docs/INTEGRATIONS.md section 8).
   *
   * Idempotent on `hospitalId + accessionNumber`: a repeated message creates no
   * second patient or study and never resets the workflow state (section 13).
   */
  async processFirstEvent(event: NormalizedHl7FirstEvent): Promise<Hl7FirstResult> {
    await this.assertHospitalExists(event.hospitalId);

    const existing = await this.prisma.study.findUnique({
      where: {
        hospitalId_accessionNumber: {
          hospitalId: event.hospitalId,
          accessionNumber: event.study.accessionNumber,
        },
      },
      select: { id: true, patientId: true, status: true },
    });

    if (existing) {
      return this.recordDuplicateFirst(event, existing);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const patient = await this.findOrCreatePatient(tx, event);

        const study = await tx.study.create({
          data: {
            hospitalId: event.hospitalId,
            patientId: patient.id,
            accessionNumber: event.study.accessionNumber,
            externalOrderId: event.study.externalOrderId,
            externalProtocolId: event.study.externalProtocolId,
            studyDescription: event.study.studyDescription,
            modality: event.study.modality,
            category: event.study.category as PatientCategory,
            status: StudyStatus.INITIAL,
            firstHl7ReceivedAt: new Date(event.receivedAt),
            // arrivalAt and slaDeadlineAt stay null on purpose: the SLA clock
            // starts at the second HL7, not at the order
            // (docs/WORKFLOW_STATE_MACHINE.md section 60).
          },
          select: { id: true },
        });

        await this.audit.record(
          {
            eventType: AuditEventType.HL7_FIRST_RECEIVED,
            hospitalId: event.hospitalId,
            patientId: patient.id,
            studyId: study.id,
            entityType: 'Study',
            entityId: study.id,
            metadata: {
              accessionNumber: event.study.accessionNumber,
              externalMessageId: event.externalMessageId,
              receivedAt: event.receivedAt,
              // No ClinicalData model exists yet (DISCOVERED-003); keeping the
              // normalized block here means the order details are not lost.
              clinicalData: event.clinicalData,
            },
          },
          tx,
        );

        await this.audit.record(
          {
            eventType: AuditEventType.STUDY_CREATED,
            hospitalId: event.hospitalId,
            patientId: patient.id,
            studyId: study.id,
            entityType: 'Study',
            entityId: study.id,
            metadata: {
              accessionNumber: event.study.accessionNumber,
              category: event.study.category,
              modality: event.study.modality,
            },
          },
          tx,
        );

        const transition = await this.workflow.transition(
          study.id,
          StudyStatus.WAITING_ACCEPTANCE,
          { reason: 'First HL7 processed' },
          tx,
        );

        this.logger.info({
          message: 'First HL7 processed',
          studyId: study.id,
          hospitalId: event.hospitalId,
          accessionNumber: event.study.accessionNumber,
        });

        return {
          studyId: study.id,
          patientId: patient.id,
          status: transition.toStatus,
          duplicate: false,
        };
      });
    } catch (error) {
      // Two identical messages arriving together: the unique constraint on
      // (hospitalId, accessionNumber) is what actually prevents the duplicate.
      if (isUniqueViolation(error)) {
        const study = await this.prisma.study.findUniqueOrThrow({
          where: {
            hospitalId_accessionNumber: {
              hospitalId: event.hospitalId,
              accessionNumber: event.study.accessionNumber,
            },
          },
          select: { id: true, patientId: true, status: true },
        });
        return this.recordDuplicateFirst(event, study);
      }
      throw error;
    }
  }

  /**
   * Second message: match the study and move it to IMAGES_PENDING
   * (docs/INTEGRATIONS.md sections 9-11).
   *
   * Matching is on `hospitalId + accessionNumber`. A supplied patient
   * identifier is only used to refuse a mismatch — never to widen the match.
   */
  async processSecondEvent(event: NormalizedHl7SecondEvent): Promise<Hl7SecondResult> {
    await this.assertHospitalExists(event.hospitalId);

    const study = await this.prisma.study.findUnique({
      where: {
        hospitalId_accessionNumber: {
          hospitalId: event.hospitalId,
          accessionNumber: event.accessionNumber,
        },
      },
      select: {
        id: true,
        status: true,
        category: true,
        patientId: true,
        arrivalAt: true,
        slaDeadlineAt: true,
        patient: { select: { externalPatientId: true } },
      },
    });

    if (!study) {
      throw new Hl7AccessionConflictException(
        'No study matches this hospital and accession number.',
        { accessionNumber: event.accessionNumber },
      );
    }

    await this.assertPatientMatches(event, study);

    // A repeat of an already-accepted study must not rewind the workflow
    // (docs/INTEGRATIONS.md section 13).
    if (study.status !== StudyStatus.WAITING_ACCEPTANCE) {
      await this.audit.record({
        eventType: AuditEventType.HL7_DUPLICATE_IGNORED,
        hospitalId: event.hospitalId,
        patientId: study.patientId,
        studyId: study.id,
        entityType: 'Study',
        entityId: study.id,
        metadata: {
          message: 'STUDY_ACCEPTED',
          accessionNumber: event.accessionNumber,
          externalMessageId: event.externalMessageId,
          currentStatus: study.status,
        },
      });

      this.logger.warn({
        message: 'Duplicate second HL7 ignored',
        studyId: study.id,
        currentStatus: study.status,
      });

      return {
        studyId: study.id,
        status: study.status as StudyStatus,
        arrivalAt: study.arrivalAt?.toISOString() ?? null,
        slaDeadlineAt: study.slaDeadlineAt?.toISOString() ?? null,
        duplicate: true,
      };
    }

    const arrivalAt = new Date(event.acceptedAt);
    const slaDeadlineAt = await this.resolveSlaDeadline(
      study.category as PatientCategory,
      arrivalAt,
      study.id,
    );

    const result = await this.prisma.$transaction(async (tx) => {
      await this.audit.record(
        {
          eventType: AuditEventType.HL7_SECOND_RECEIVED,
          hospitalId: event.hospitalId,
          patientId: study.patientId,
          studyId: study.id,
          entityType: 'Study',
          entityId: study.id,
          metadata: {
            accessionNumber: event.accessionNumber,
            externalMessageId: event.externalMessageId,
            acceptedAt: event.acceptedAt,
            clinicalData: event.clinicalData,
          },
        },
        tx,
      );

      return this.workflow.transition(
        study.id,
        StudyStatus.IMAGES_PENDING,
        {
          reason: 'Second HL7 matched',
          studyData: {
            secondHl7ReceivedAt: new Date(event.acceptedAt),
            // The SLA clock starts here (WORKFLOW_STATE_MACHINE section 60).
            arrivalAt,
            slaDeadlineAt,
          },
        },
        tx,
      );
    });

    this.logger.info({
      message: 'Second HL7 processed',
      studyId: study.id,
      accessionNumber: event.accessionNumber,
    });

    return {
      studyId: study.id,
      status: result.toStatus,
      arrivalAt: arrivalAt.toISOString(),
      slaDeadlineAt: slaDeadlineAt?.toISOString() ?? null,
      duplicate: false,
    };
  }

  private async assertHospitalExists(hospitalId: string): Promise<void> {
    const hospital = await this.prisma.hospital.findUnique({
      where: { id: hospitalId },
      select: { id: true },
    });

    if (!hospital) {
      throw new Hl7UnknownHospitalException({ hospitalId });
    }
  }

  /**
   * Refuses when the accession matched but a supplied patient identifier
   * disagrees (docs/INTEGRATIONS.md section 11).
   *
   * Stopping with a clear error is safer than attaching a study to the wrong
   * patient (CLAUDE.md section 16).
   */
  private async assertPatientMatches(
    event: NormalizedHl7SecondEvent,
    study: { id: string; patientId: string; patient: { externalPatientId: string } },
  ): Promise<void> {
    if (!event.externalPatientId) return;
    if (event.externalPatientId === study.patient.externalPatientId) return;

    await this.audit.record({
      eventType: AuditEventType.HL7_PATIENT_MISMATCH,
      hospitalId: event.hospitalId,
      patientId: study.patientId,
      studyId: study.id,
      entityType: 'Study',
      entityId: study.id,
      metadata: {
        accessionNumber: event.accessionNumber,
        expectedExternalPatientId: study.patient.externalPatientId,
        receivedExternalPatientId: event.externalPatientId,
      },
    });

    this.logger.error({
      message: 'HL7 patient mismatch refused',
      studyId: study.id,
      accessionNumber: event.accessionNumber,
    });

    throw new Hl7PatientMismatchException({
      accessionNumber: event.accessionNumber,
      studyId: study.id,
    });
  }

  private async findOrCreatePatient(
    tx: Prisma.TransactionClient,
    event: NormalizedHl7FirstEvent,
  ): Promise<{ id: string; created: boolean }> {
    const existing = await tx.patient.findUnique({
      where: {
        hospitalId_externalPatientId: {
          hospitalId: event.hospitalId,
          externalPatientId: event.patient.externalPatientId,
        },
      },
      select: { id: true },
    });

    if (existing) {
      // Existing demographics are left untouched: a later order must not
      // silently rewrite an identity the clinical record already relies on.
      return { id: existing.id, created: false };
    }

    const patient = await tx.patient.create({
      data: {
        hospitalId: event.hospitalId,
        externalPatientId: event.patient.externalPatientId,
        firstName: event.patient.firstName ?? '',
        lastName: event.patient.lastName ?? '',
        birthDate: event.patient.birthDate ? new Date(event.patient.birthDate) : null,
        gender: event.patient.gender,
      },
      select: { id: true },
    });

    await this.audit.record(
      {
        eventType: AuditEventType.PATIENT_CREATED,
        hospitalId: event.hospitalId,
        patientId: patient.id,
        entityType: 'Patient',
        entityId: patient.id,
        metadata: { externalPatientId: event.patient.externalPatientId },
      },
      tx,
    );

    return { id: patient.id, created: true };
  }

  private async recordDuplicateFirst(
    event: NormalizedHl7FirstEvent,
    study: { id: string; patientId: string; status: string },
  ): Promise<Hl7FirstResult> {
    await this.audit.record({
      eventType: AuditEventType.HL7_DUPLICATE_IGNORED,
      hospitalId: event.hospitalId,
      patientId: study.patientId,
      studyId: study.id,
      entityType: 'Study',
      entityId: study.id,
      metadata: {
        message: 'FIRST_ORDER',
        accessionNumber: event.study.accessionNumber,
        externalMessageId: event.externalMessageId,
        currentStatus: study.status,
      },
    });

    this.logger.warn({
      message: 'Duplicate first HL7 ignored',
      studyId: study.id,
      accessionNumber: event.study.accessionNumber,
      currentStatus: study.status,
    });

    return {
      studyId: study.id,
      patientId: study.patientId,
      status: study.status as StudyStatus,
      duplicate: true,
    };
  }

  /**
   * Freezes the SLA deadline at arrival, so a later policy change cannot move a
   * historical deadline (docs/DATA_MODEL.md section 66).
   *
   * Returns null when no active policy exists for the category. YOGUN_BAKIM is
   * the known case: its duration is undefined (BLOCKED_SPEC) and must not be
   * invented (CLAUDE.md section 31).
   */
  private async resolveSlaDeadline(
    category: PatientCategory,
    arrivalAt: Date,
    studyId: string,
  ): Promise<Date | null> {
    const policy = await this.prisma.slaPolicy.findFirst({
      where: { category, active: true },
      select: { durationMinutes: true },
    });

    if (!policy) {
      this.logger.warn({
        message: 'No active SLA policy for category; deadline left unset',
        studyId,
        category,
      });
      return null;
    }

    return new Date(arrivalAt.getTime() + policy.durationMinutes * 60_000);
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION
  );
}
