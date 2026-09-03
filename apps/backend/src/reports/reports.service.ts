import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  ReportSource,
  ReportStatus,
  StudyStatus,
  UserRole,
  type ReportDto,
  type ReportVersionDto,
} from '@radiology/shared';
import { PrismaService } from '../prisma/prisma.service';
import { WorkflowService } from '../workflow/workflow.service';
import { LockNotOwnedException, StudyLockService } from '../locks/study-lock.service';
import { HospitalScopeService } from '../auth/hospital-scope.service';
import { AuditService } from '../audit/audit.service';
import { RealtimeService } from '../realtime/realtime.service';
import { AuditEventType } from '../audit/audit.types';
import {
  ForbiddenAppException,
  InvalidStateTransitionException,
  NotFoundAppException,
} from '../common/errors/app.exception';
import { AppLogger } from '../common/logging/app-logger.service';
import {
  EmptyReportException,
  NotAssignedReporterException,
  ReportNotEditableException,
} from './report.errors';
import type { AuthenticatedUser } from '../auth/auth.types';

export interface StartTranscriptionResult {
  studyId: string;
  status: StudyStatus;
  report: ReportDto;
  lock: {
    ownerUserId: string;
    ownerRole: UserRole;
    lockedAt: string;
    heartbeatIntervalSeconds: number;
  };
}

export interface SubmitReportResult {
  studyId: string;
  status: StudyStatus;
  report: { id: string; currentVersionId: string | null; status: ReportStatus };
  lockReleased: boolean;
}

/**
 * Reporter workflow and report versioning
 * (TASK_QUEUE BACKEND-025, 026, 028, 029).
 *
 * A finalized version is never rewritten: drafts are edited in place while they
 * are drafts, and anything already completed or final is superseded by a new
 * version instead (CLAUDE.md section 21).
 */
@Injectable()
export class ReportsService {
  private readonly logger: AppLogger;

  constructor(
    private readonly prisma: PrismaService,
    private readonly workflow: WorkflowService,
    private readonly locks: StudyLockService,
    private readonly hospitalScope: HospitalScopeService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    logger: AppLogger,
  ) {
    this.logger = logger.child(ReportsService.name);
  }

  /**
   * `POST /studies/:id/start-transcription` (API_CONTRACT sections 50-51).
   *
   * The lock is taken before the state check, for the same reason as
   * start-reading: once reporter A is transcribing the status has moved on, and
   * reporter B must be told the study is taken, not that it is in the wrong
   * state.
   */
  async startTranscription(
    user: AuthenticatedUser,
    studyId: string,
  ): Promise<StartTranscriptionResult> {
    const study = await this.loadStudyInScope(user, studyId);

    const { lock, alreadyOwned } = await this.locks.acquire(studyId, {
      userId: user.id,
      displayName: await this.displayNameFor(user.id),
      role: user.role,
    });

    try {
      if (study.status !== StudyStatus.WAITING_TRANSCRIPTION) {
        throw new InvalidStateTransitionException(study.status, StudyStatus.TRANSCRIBING);
      }

      await this.prisma.$transaction(async (tx) => {
        const created = await this.ensureReportWithDraft(tx, studyId, user.id);

        await tx.studyAssignment.create({
          data: { studyId, userId: user.id, type: 'REPORTER', assignedBy: user.id },
        });

        await this.audit.record(
          {
            eventType: AuditEventType.TRANSCRIPTION_STARTED,
            actor: { userId: user.id, role: user.role },
            hospitalId: study.hospitalId,
            patientId: study.patientId,
            studyId,
            entityType: 'Report',
            entityId: created.id,
          },
          tx,
        );

        await this.workflow.transition(
          studyId,
          StudyStatus.TRANSCRIBING,
          {
            actorUserId: user.id,
            actorRole: user.role,
            reason: 'Reporter started transcription',
            studyData: { assignedReporterId: user.id },
          },
          tx,
        );

        return created;
      });

      this.realtime.emitStudyStatusChanged(
        { studyId, hospitalId: study.hospitalId, actor: { userId: user.id, role: user.role } },
        { fromStatus: StudyStatus.WAITING_TRANSCRIPTION, toStatus: StudyStatus.TRANSCRIBING },
      );

      this.logger.info({ message: 'Transcription started', studyId, reporterId: user.id });

      return {
        studyId,
        status: StudyStatus.TRANSCRIBING,
        report: await this.getReport(user, studyId),
        lock: {
          ownerUserId: lock.ownerUserId,
          ownerRole: lock.ownerRole,
          lockedAt: lock.lockedAt,
          heartbeatIntervalSeconds: this.locks.heartbeatSeconds,
        },
      };
    } catch (error) {
      if (!alreadyOwned) {
        await this.locks.release(studyId, user.id).catch(() => undefined);
      }
      throw error;
    }
  }

  /**
   * `POST /studies/:id/resume-transcription`
   * (API_CONTRACT section 51.1, WORKFLOW_STATE_MACHINE section 34.1).
   *
   * Recovery, not a transition. The reporter lock lives 60 seconds and is kept
   * alive by heartbeats; a closed tab or a dropped network stops those and the
   * lock lapses while the study stays TRANSCRIBING with its assignment intact.
   * `start-transcription` only accepts WAITING_TRANSCRIPTION, so without this
   * the assigned reporter could never get back to their own draft.
   *
   * Nothing about the work changes here: no status transition, no new report
   * version. The only effect is that the lock exists again.
   *
   * Authorization is checked BEFORE the lock is taken, which is the opposite
   * order from start-transcription. There the race is between two legitimate
   * claimants, so whoever gets the lock wins. Here there is exactly one
   * rightful owner, and acquiring first would let an unauthorized caller hold
   * the real reporter's study for the moment before being refused.
   */
  async resumeTranscription(
    user: AuthenticatedUser,
    studyId: string,
  ): Promise<StartTranscriptionResult> {
    const study = await this.loadStudyInScope(user, studyId);

    if (study.status !== StudyStatus.TRANSCRIBING) {
      // Not a resumable situation: either transcription never started, or it
      // is already finished. Same code the entry point uses.
      throw new InvalidStateTransitionException(study.status, StudyStatus.TRANSCRIBING);
    }

    if (study.assignedReporterId !== user.id) {
      throw new NotAssignedReporterException();
    }

    // The assignment row is the durable record of whose work this is
    // (WORKFLOW_STATE_MACHINE section 74 invariant 2). A released assignment
    // means the reporter already handed the study on, so there is nothing to
    // resume even though the id may still be on the study row.
    const assignment = await this.prisma.studyAssignment.findFirst({
      where: { studyId, userId: user.id, type: 'REPORTER', releasedAt: null },
      select: { id: true },
    });

    if (!assignment) {
      throw new NotAssignedReporterException();
    }

    // Throws STUDY_LOCKED when somebody else holds it: this is a resume, never
    // a takeover. Force release stays with Operation/Manager (CLAUDE.md 18).
    const { lock } = await this.locks.acquire(studyId, {
      userId: user.id,
      displayName: await this.displayNameFor(user.id),
      role: user.role,
    });

    await this.audit.record({
      eventType: AuditEventType.TRANSCRIPTION_RESUMED,
      actor: { userId: user.id, role: user.role },
      hospitalId: study.hospitalId,
      patientId: study.patientId,
      studyId,
      entityType: 'Study',
      entityId: studyId,
      metadata: { lockedAt: lock.lockedAt },
    });

    // No status change to announce, so the lock is the only news — and other
    // clients watching this study need it (REALTIME_EVENTS section 24).
    this.realtime.emitStudyLocked(
      { studyId, hospitalId: study.hospitalId, actor: { userId: user.id, role: user.role } },
      {
        ownerUserId: lock.ownerUserId,
        ownerDisplayName: lock.ownerDisplayName,
        ownerRole: lock.ownerRole,
        lockedAt: lock.lockedAt,
        lockType: 'INTERNAL',
      },
    );

    this.logger.info({ message: 'Transcription resumed', studyId, reporterId: user.id });

    return {
      studyId,
      status: StudyStatus.TRANSCRIBING,
      report: await this.getReport(user, studyId),
      lock: {
        ownerUserId: lock.ownerUserId,
        ownerRole: lock.ownerRole,
        lockedAt: lock.lockedAt,
        heartbeatIntervalSeconds: this.locks.heartbeatSeconds,
      },
    };
  }

  /** `GET /studies/:id/report` (API_CONTRACT section 52). */
  async getReport(user: AuthenticatedUser, studyId: string): Promise<ReportDto> {
    await this.loadStudyInScope(user, studyId);

    const report = await this.prisma.report.findUnique({
      where: { studyId },
      include: { currentVersion: { include: { author: AUTHOR_SELECT } } },
    });

    if (!report) {
      throw new NotFoundAppException('No report exists for this study yet.');
    }

    return toReportDto(report);
  }

  /**
   * `GET /studies/:id/report/versions` (API_CONTRACT section 81).
   *
   * Every role may read the history of a study inside their hospital scope
   * (docs/AUTH_ROLES_PERMISSIONS.md section 91): the doctor to see what they
   * are approving, the reporter to see their own earlier drafts, Operation for
   * revision tracking and Manager across the hospitals they are authorized
   * for. Scope is what limits this, not the role — and it is enforced below
   * before a single version is read.
   *
   * Ordered by `versionNumber` ascending: it is unique per report
   * (DATA_MODEL.md section 38), so the order is total and cannot vary between
   * two calls the way a timestamp sort can when two rows share a millisecond.
   */
  async listVersions(user: AuthenticatedUser, studyId: string): Promise<ReportVersionDto[]> {
    await this.loadStudyInScope(user, studyId);

    const report = await this.prisma.report.findUnique({
      where: { studyId },
      select: { id: true },
    });

    if (!report) {
      // Same answer `GET /report` gives for a study nobody has transcribed yet,
      // so the client does not have to tell two "nothing here" shapes apart.
      throw new NotFoundAppException('No report exists for this study yet.');
    }

    const versions = await this.prisma.reportVersion.findMany({
      where: { reportId: report.id },
      include: { author: AUTHOR_SELECT },
      orderBy: { versionNumber: 'asc' },
    });

    return versions.map(toReportVersionDto);
  }

  /**
   * `PUT /studies/:id/report/draft` (API_CONTRACT sections 53-54).
   *
   * Only the lock owner may write, and only into a draft version. A completed
   * or final version is history and is never edited in place.
   */
  async saveDraft(
    user: AuthenticatedUser,
    studyId: string,
    content: string,
  ): Promise<{ reportId: string; versionId: string; status: ReportStatus; savedAt: string }> {
    const study = await this.loadStudyInScope(user, studyId);

    if (study.status !== StudyStatus.TRANSCRIBING) {
      throw new InvalidStateTransitionException(study.status, StudyStatus.TRANSCRIBING);
    }

    await this.assertLockOwner(studyId, user.id);

    const version = await this.loadEditableDraft(studyId, user.id);
    const savedAt = new Date();

    await this.prisma.reportVersion.update({
      where: { id: version.id },
      data: { content },
    });

    return {
      reportId: version.reportId,
      versionId: version.id,
      status: version.status as ReportStatus,
      savedAt: savedAt.toISOString(),
    };
  }

  /**
   * `POST /studies/:id/submit-report` (API_CONTRACT sections 55-56).
   *
   * Completes the draft version and hands the study to the doctor's approval
   * queue, releasing the reporter lock.
   */
  async submitReport(
    user: AuthenticatedUser,
    studyId: string,
    content?: string,
  ): Promise<SubmitReportResult> {
    const study = await this.loadStudyInScope(user, studyId);

    if (study.status !== StudyStatus.TRANSCRIBING) {
      throw new InvalidStateTransitionException(study.status, StudyStatus.WAITING_APPROVAL);
    }

    await this.assertLockOwner(studyId, user.id);

    const version = await this.loadEditableDraft(studyId, user.id);
    const finalContent = content ?? version.content;

    if (finalContent.trim().length === 0) {
      // An empty report would reach the doctor's approval queue with nothing to
      // approve.
      throw new EmptyReportException();
    }

    const completedAt = new Date();

    const report = await this.prisma.$transaction(async (tx) => {
      await tx.reportVersion.update({
        where: { id: version.id },
        data: {
          content: finalContent,
          status: ReportStatus.COMPLETED,
          completedAt,
        },
      });

      const updated = await tx.report.update({
        where: { id: version.reportId },
        data: { status: ReportStatus.WAITING_APPROVAL, currentVersionId: version.id },
      });

      await tx.studyAssignment.updateMany({
        where: { studyId, userId: user.id, type: 'REPORTER', releasedAt: null },
        data: { releasedAt: completedAt },
      });

      await this.audit.record(
        {
          eventType: AuditEventType.REPORT_SUBMITTED,
          actor: { userId: user.id, role: user.role },
          hospitalId: study.hospitalId,
          patientId: study.patientId,
          studyId,
          entityType: 'ReportVersion',
          entityId: version.id,
          // Report text is never logged, only its size (CLAUDE.md section 42).
          metadata: { versionNumber: version.versionNumber, contentLength: finalContent.length },
        },
        tx,
      );

      await this.workflow.transition(
        studyId,
        StudyStatus.WAITING_APPROVAL,
        {
          actorUserId: user.id,
          actorRole: user.role,
          reason: 'Reporter submitted the report',
        },
        tx,
      );

      return updated;
    });

    const lockReleased = await this.locks.release(studyId, user.id).catch(() => false);

    const context = { studyId, hospitalId: study.hospitalId, actor: { userId: user.id, role: user.role } }; // prettier-ignore
    this.realtime.emitStudyStatusChanged(context, {
      fromStatus: StudyStatus.TRANSCRIBING,
      toStatus: StudyStatus.WAITING_APPROVAL,
    });
    if (lockReleased) {
      this.realtime.emitStudyUnlocked(context, {
        previousOwnerUserId: user.id,
        previousOwnerRole: user.role,
        reason: 'WORKFLOW_COMPLETED',
      });
    }
    // The doctor who owns this study gets a personal event; nobody else's
    // approval queue is affected (REALTIME_EVENTS section 29).
    if (study.assignedDoctorId) {
      this.realtime.emitStudyWaitingApproval(context, {
        doctorId: study.assignedDoctorId,
        reportId: report.id,
        reportVersionId: version.id,
        submittedAt: new Date().toISOString(),
      });
    }

    this.logger.info({ message: 'Report submitted', studyId, reporterId: user.id });

    return {
      studyId,
      status: StudyStatus.WAITING_APPROVAL,
      report: {
        id: report.id,
        currentVersionId: report.currentVersionId,
        status: report.status as ReportStatus,
      },
      lockReleased,
    };
  }

  /**
   * Returns the report and its first draft, creating them when the reporter
   * first opens the study.
   */
  private async ensureReportWithDraft(
    tx: Prisma.TransactionClient,
    studyId: string,
    userId: string,
  ) {
    const existing = await tx.report.findUnique({
      where: { studyId },
      include: { currentVersion: true },
    });

    if (existing?.currentVersion && isEditable(existing.currentVersion.status)) {
      return existing;
    }

    const report =
      existing ??
      (await tx.report.create({ data: { studyId, status: ReportStatus.DRAFT } }));

    const lastVersion = await tx.reportVersion.findFirst({
      where: { reportId: report.id },
      orderBy: { versionNumber: 'desc' },
      select: { id: true, versionNumber: true },
    });

    // A new draft supersedes the previous version rather than replacing it, so
    // the earlier text stays readable (DATA_MODEL.md section 40).
    const version = await tx.reportVersion.create({
      data: {
        reportId: report.id,
        versionNumber: (lastVersion?.versionNumber ?? 0) + 1,
        content: '',
        source: ReportSource.REPORTER,
        status: ReportStatus.DRAFT,
        createdBy: userId,
        supersedesVersionId: lastVersion?.id,
      },
    });

    return tx.report.update({
      where: { id: report.id },
      data: { status: ReportStatus.DRAFT, currentVersionId: version.id },
      include: { currentVersion: true },
    });
  }

  private async loadEditableDraft(studyId: string, userId: string) {
    const report = await this.prisma.report.findUnique({
      where: { studyId },
      include: { currentVersion: true },
    });

    if (!report?.currentVersion) {
      throw new NotFoundAppException('No report draft exists for this study.');
    }

    if (!isEditable(report.currentVersion.status)) {
      // Editing a completed or final version in place would rewrite history.
      throw new ReportNotEditableException(report.currentVersion.status);
    }

    if (report.currentVersion.createdBy !== userId) {
      throw new ForbiddenAppException('This report draft belongs to another user.');
    }

    return report.currentVersion;
  }

  private async loadStudyInScope(user: AuthenticatedUser, studyId: string) {
    const study = await this.prisma.study.findUnique({
      where: { id: studyId },
      select: {
        id: true,
        hospitalId: true,
        patientId: true,
        status: true,
        assignedDoctorId: true,
        assignedReporterId: true,
      },
    });

    if (!study) {
      throw new NotFoundAppException('Study not found.');
    }

    this.hospitalScope.assertAllowed(user, study.hospitalId);

    return { ...study, status: study.status as StudyStatus };
  }

  private async assertLockOwner(studyId: string, userId: string): Promise<void> {
    const lock = await this.locks.getLock(studyId);

    if (!lock || lock.ownerUserId !== userId) {
      throw new LockNotOwnedException({ studyId });
    }
  }

  private async displayNameFor(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });

    return user ? `${user.firstName} ${user.lastName}`.trim() : '';
  }
}

const AUTHOR_SELECT = { select: { id: true, firstName: true, lastName: true } } as const;

/** Statuses whose content may still be edited in place. */
function isEditable(status: string): boolean {
  return status === ReportStatus.DRAFT || status === ReportStatus.REVISION_DRAFT;
}

interface ReportRow {
  id: string;
  studyId: string;
  status: string;
  finalizedAt: Date | null;
  currentVersion: AuthoredVersionRow | null;
}

interface VersionRow {
  id: string;
  versionNumber: number;
  content: string;
  source: string;
  status: string;
  createdAt: Date;
  completedAt: Date | null;
  finalizedAt: Date | null;
}

type AuthoredVersionRow = VersionRow & {
  author: { id: string; firstName: string; lastName: string };
};

/**
 * One version -> its API shape. Shared by `GET /report` and
 * `GET /report/versions`, so the current version cannot be described one way
 * in the report and another way in the history.
 */
export function toReportVersionDto(version: AuthoredVersionRow): ReportVersionDto {
  return {
    id: version.id,
    versionNumber: version.versionNumber,
    content: version.content,
    source: version.source as ReportSource,
    status: version.status as ReportStatus,
    createdBy: {
      id: version.author.id,
      displayName: `${version.author.firstName} ${version.author.lastName}`.trim(),
    },
    createdAt: version.createdAt.toISOString(),
    completedAt: version.completedAt?.toISOString() ?? null,
    finalizedAt: version.finalizedAt?.toISOString() ?? null,
  };
}

export function toReportDto(report: ReportRow): ReportDto {
  return {
    id: report.id,
    studyId: report.studyId,
    status: report.status as ReportStatus,
    finalizedAt: report.finalizedAt?.toISOString() ?? null,
    currentVersion: report.currentVersion ? toReportVersionDto(report.currentVersion) : null,
  };
}
