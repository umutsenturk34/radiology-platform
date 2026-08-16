import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { ApiErrorCode, DictationStatus, StudyStatus, UserRole } from '@radiology/shared';
import { PrismaService } from '../prisma/prisma.service';
import { StudyLockService } from '../locks/study-lock.service';
import { HospitalScopeService } from '../auth/hospital-scope.service';
import { AuditService } from '../audit/audit.service';
import { AuditEventType } from '../audit/audit.types';
import { LockNotOwnedException } from '../locks/study-lock.service';
import {
  AppException,
  ForbiddenAppException,
  InvalidStateTransitionException,
  NotFoundAppException,
  ValidationAppException,
} from '../common/errors/app.exception';
import { AppLogger } from '../common/logging/app-logger.service';
import { OBJECT_STORAGE, type ObjectStorage } from '../storage/object-storage.contract';
import { PlaybackTokenService } from './playback-token.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { StorageConfig } from '../config/configuration';

/** Audio types the pilot accepts from the browser recorder. */
const ALLOWED_MIME_TYPES = [
  'audio/webm',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/x-wav',
];

export interface DictationDto {
  id: string;
  studyId: string;
  doctor: { id: string; displayName: string };
  status: DictationStatus;
  mimeType: string | null;
  fileSize: number | null;
  durationMs: number | null;
  startedAt: string;
  completedAt: string | null;
  uploadedAt: string | null;
  failureReason: string | null;
}

/** 409 — the recording is not in a state where this action makes sense. */
class DictationStateException extends AppException {
  constructor(currentStatus: string) {
    super(ApiErrorCode.CONFLICT, 'The dictation is not in a state that allows this action.', HttpStatus.CONFLICT, { currentStatus }); // prettier-ignore
  }
}

/**
 * Dictation lifecycle (TASK_QUEUE BACKEND-023).
 *
 * Only the doctor holding the study lock may record or upload; playback is
 * open to the roles that need the audio to do their job
 * (docs/AUTH_ROLES_PERMISSIONS.md sections 11, 22 and 62).
 *
 * The audio itself always goes to object storage; PostgreSQL keeps metadata
 * only (CLAUDE.md section 20).
 */
@Injectable()
export class DictationsService {
  private readonly logger: AppLogger;
  private readonly storageConfig: StorageConfig;

  constructor(
    private readonly prisma: PrismaService,
    private readonly locks: StudyLockService,
    private readonly hospitalScope: HospitalScopeService,
    private readonly audit: AuditService,
    private readonly playbackTokens: PlaybackTokenService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    config: ConfigService,
    logger: AppLogger,
  ) {
    this.logger = logger.child(DictationsService.name);
    this.storageConfig = config.get<StorageConfig>('app.storage') ?? {
      driver: 'local',
      localDir: '.storage',
      playbackUrlTtlSeconds: 300,
      maxUploadBytes: 50 * 1024 * 1024,
    };
  }

  /** `POST /studies/:id/dictations` — doctor holding the reading lock. */
  async create(
    user: AuthenticatedUser,
    studyId: string,
    input: { mimeType?: string },
  ): Promise<DictationDto> {
    const study = await this.loadStudyInScope(user, studyId);

    if (study.status !== StudyStatus.READING) {
      throw new InvalidStateTransitionException(study.status, StudyStatus.READING);
    }

    await this.assertLockOwner(studyId, user.id);

    if (input.mimeType && !isAllowedMimeType(input.mimeType)) {
      throw new ValidationAppException({ mimeType: ['Unsupported audio type.'] });
    }

    const dictation = await this.prisma.dictation.create({
      data: {
        studyId,
        doctorId: user.id,
        mimeType: input.mimeType ?? null,
        status: DictationStatus.RECORDING,
      },
      include: DICTATION_INCLUDE,
    });

    await this.audit.record({
      eventType: AuditEventType.DICTATION_STARTED,
      actor: { userId: user.id, role: user.role },
      hospitalId: study.hospitalId,
      patientId: study.patientId,
      studyId,
      entityType: 'Dictation',
      entityId: dictation.id,
    });

    return toDictationDto(dictation);
  }

  /**
   * `POST /dictations/:id/upload` — stores the audio and completes the record.
   *
   * A failed upload marks the dictation FAILED rather than leaving it
   * RECORDING, so the doctor is never shown a recording that looks finished
   * but has no audio behind it.
   */
  async upload(
    user: AuthenticatedUser,
    dictationId: string,
    file: { buffer: Buffer; mimetype: string; size: number },
    input: { durationMs?: number },
  ): Promise<DictationDto> {
    const dictation = await this.loadDictation(dictationId);
    const study = await this.loadStudyInScope(user, dictation.studyId);

    if (dictation.doctorId !== user.id) {
      throw new ForbiddenAppException('Only the recording doctor may upload this dictation.');
    }

    await this.assertLockOwner(dictation.studyId, user.id);

    if (dictation.status === DictationStatus.COMPLETED) {
      // Re-uploading over a completed recording would silently replace clinical
      // audio the reporter may already have transcribed.
      throw new DictationStateException(dictation.status);
    }

    if (!file || file.size === 0) {
      throw new ValidationAppException({ file: ['An audio file is required.'] });
    }

    if (file.size > this.storageConfig.maxUploadBytes) {
      throw new ValidationAppException({
        file: [`The audio file exceeds ${this.storageConfig.maxUploadBytes} bytes.`],
      });
    }

    const mimeType = dictation.mimeType ?? file.mimetype;
    if (!isAllowedMimeType(mimeType)) {
      throw new ValidationAppException({ file: ['Unsupported audio type.'] });
    }

    await this.prisma.dictation.update({
      where: { id: dictationId },
      data: { status: DictationStatus.UPLOADING },
    });

    const key = buildStorageKey(dictation.studyId, dictationId, mimeType);

    try {
      const stored = await this.storage.upload(key, file.buffer, { mimeType });

      const updated = await this.prisma.dictation.update({
        where: { id: dictationId },
        data: {
          storageKey: stored.key,
          mimeType,
          fileSize: stored.size,
          checksum: stored.checksum,
          durationMs: input.durationMs ?? null,
          status: DictationStatus.COMPLETED,
          completedAt: new Date(),
          uploadedAt: new Date(),
          failureReason: null,
        },
        include: DICTATION_INCLUDE,
      });

      await this.audit.record({
        eventType: AuditEventType.DICTATION_UPLOADED,
        actor: { userId: user.id, role: user.role },
        hospitalId: study.hospitalId,
        patientId: study.patientId,
        studyId: dictation.studyId,
        entityType: 'Dictation',
        entityId: dictationId,
        // The audio itself is never logged, only its metadata.
        metadata: { fileSize: stored.size, mimeType, durationMs: input.durationMs ?? null },
      });

      this.logger.info({
        message: 'Dictation uploaded',
        dictationId,
        studyId: dictation.studyId,
        fileSize: stored.size,
      });

      return toDictationDto(updated);
    } catch (error) {
      await this.prisma.dictation.update({
        where: { id: dictationId },
        data: {
          status: DictationStatus.FAILED,
          failureReason: 'Upload to object storage failed.',
        },
      });

      this.logger.error({
        message: 'Dictation upload failed',
        dictationId,
        reason: error instanceof Error ? error.message : 'unknown error',
      });

      throw error;
    }
  }

  /** `GET /studies/:id/dictations`. */
  async listForStudy(user: AuthenticatedUser, studyId: string): Promise<DictationDto[]> {
    await this.loadStudyInScope(user, studyId);

    const dictations = await this.prisma.dictation.findMany({
      where: { studyId },
      include: DICTATION_INCLUDE,
      orderBy: { startedAt: 'asc' },
    });

    return dictations.map(toDictationDto);
  }

  /** `GET /dictations/:id/playback` — a short-lived URL, never a public one. */
  async getPlaybackUrl(
    user: AuthenticatedUser,
    dictationId: string,
  ): Promise<{ url: string; expiresAt: string }> {
    const dictation = await this.loadDictation(dictationId);
    await this.loadStudyInScope(user, dictation.studyId);

    if (dictation.status !== DictationStatus.COMPLETED || !dictation.storageKey) {
      throw new DictationStateException(dictation.status);
    }

    const ttl = this.storageConfig.playbackUrlTtlSeconds;
    const signed = await this.storage.getSignedUrl(dictation.storageKey, ttl);

    if (signed) {
      return { url: signed, expiresAt: new Date(Date.now() + ttl * 1000).toISOString() };
    }

    // The local driver cannot sign, so the backend serves the audio itself
    // behind a token bound to this dictation and this user.
    const { token, expiresAt } = this.playbackTokens.issue(dictationId, user.id, ttl);

    return {
      url: `/api/v1/dictations/${dictationId}/audio?token=${encodeURIComponent(token)}`,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * Streams the audio for a token-carrying request.
   *
   * Reached without a session, so authority comes entirely from the token; the
   * hospital scope of the user it was issued to is re-checked here.
   */
  async streamAudio(
    dictationId: string,
    token: string | undefined,
  ): Promise<{ stream: Readable; mimeType: string; size: number }> {
    const userId = this.playbackTokens.verify(token, dictationId);

    const dictation = await this.loadDictation(dictationId);
    if (!dictation.storageKey || dictation.status !== DictationStatus.COMPLETED) {
      throw new NotFoundAppException('Dictation audio not found.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { hospitalAccess: { select: { hospitalId: true } } },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new ForbiddenAppException('The playback token is no longer valid.');
    }

    const study = await this.prisma.study.findUnique({
      where: { id: dictation.studyId },
      select: { hospitalId: true },
    });

    if (!study) {
      throw new NotFoundAppException('Dictation audio not found.');
    }

    this.hospitalScope.assertAllowed(
      {
        role: user.role as UserRole,
        hospitalIds: user.hospitalAccess.map((access) => access.hospitalId),
      },
      study.hospitalId,
    );

    return {
      stream: await this.storage.createReadStream(dictation.storageKey),
      mimeType: dictation.mimeType ?? 'application/octet-stream',
      size: await this.storage.getSize(dictation.storageKey),
    };
  }

  /** Used by complete-reading to check the dictation requirement. */
  async findCompleted(studyId: string, dictationId?: string) {
    return this.prisma.dictation.findFirst({
      where: {
        studyId,
        status: DictationStatus.COMPLETED,
        ...(dictationId ? { id: dictationId } : {}),
      },
      select: { id: true },
    });
  }

  private async loadDictation(dictationId: string) {
    const dictation = await this.prisma.dictation.findUnique({ where: { id: dictationId } });

    if (!dictation) {
      throw new NotFoundAppException('Dictation not found.');
    }

    return dictation;
  }

  private async loadStudyInScope(user: AuthenticatedUser, studyId: string) {
    const study = await this.prisma.study.findUnique({
      where: { id: studyId },
      select: { id: true, hospitalId: true, patientId: true, status: true },
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
}

const DICTATION_INCLUDE = {
  doctor: { select: { id: true, firstName: true, lastName: true } },
} as const;

interface DictationRow {
  id: string;
  studyId: string;
  status: string;
  mimeType: string | null;
  fileSize: number | null;
  durationMs: number | null;
  startedAt: Date;
  completedAt: Date | null;
  uploadedAt: Date | null;
  failureReason: string | null;
  doctor: { id: string; firstName: string; lastName: string };
}

function toDictationDto(dictation: DictationRow): DictationDto {
  return {
    id: dictation.id,
    studyId: dictation.studyId,
    doctor: {
      id: dictation.doctor.id,
      displayName: `${dictation.doctor.firstName} ${dictation.doctor.lastName}`.trim(),
    },
    status: dictation.status as DictationStatus,
    mimeType: dictation.mimeType,
    fileSize: dictation.fileSize,
    durationMs: dictation.durationMs,
    startedAt: dictation.startedAt.toISOString(),
    completedAt: dictation.completedAt?.toISOString() ?? null,
    uploadedAt: dictation.uploadedAt?.toISOString() ?? null,
    failureReason: dictation.failureReason,
  };
}

function isAllowedMimeType(mimeType: string): boolean {
  // Browsers append codec parameters, e.g. `audio/webm;codecs=opus`.
  const base = mimeType.split(';')[0].trim().toLowerCase();
  return ALLOWED_MIME_TYPES.includes(base);
}

function buildStorageKey(studyId: string, dictationId: string, mimeType: string): string {
  const extension = extensionFor(mimeType);
  return `dictations/${studyId}/${dictationId}-${randomUUID()}${extension}`;
}

function extensionFor(mimeType: string): string {
  const base = mimeType.split(';')[0].trim().toLowerCase();
  const map: Record<string, string> = {
    'audio/webm': '.webm',
    'audio/ogg': '.ogg',
    'audio/mpeg': '.mp3',
    'audio/mp4': '.m4a',
    'audio/wav': '.wav',
    'audio/x-wav': '.wav',
  };
  return map[base] ?? '.bin';
}
