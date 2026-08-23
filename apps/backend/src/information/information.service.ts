import { Injectable } from '@nestjs/common';
import {
  UserRole,
  type CreatedInformationNote,
  type InformationNoteDto,
  type InformationNoteVersionDto,
} from '@radiology/shared';
import { PrismaService } from '../prisma/prisma.service';
import { HospitalScopeService } from '../auth/hospital-scope.service';
import { AuditService } from '../audit/audit.service';
import { AuditEventType } from '../audit/audit.types';
import { ForbiddenAppException, NotFoundAppException } from '../common/errors/app.exception';
import type { AuthenticatedUser } from '../auth/auth.types';

/** Roles allowed to correct someone else's note (AUTH_ROLES_PERMISSIONS 65). */
const NOTE_SUPERVISOR_ROLES: readonly string[] = [UserRole.OPERATION, UserRole.MANAGER];

/**
 * Information notes (TASK_QUEUE BACKEND-041).
 *
 * The service exposes no delete, and neither does the controller: the API has
 * no delete endpoint at all (docs/API_CONTRACT.md section 71) and not even a
 * Manager may remove note history (AUTH_ROLES_PERMISSIONS.md — "Information
 * history silemez"). Editing a note appends a version; it never overwrites one.
 */
@Injectable()
export class InformationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hospitalScope: HospitalScopeService,
    private readonly audit: AuditService,
  ) {}

  async listForStudy(user: AuthenticatedUser, studyId: string): Promise<InformationNoteDto[]> {
    const study = await this.findStudyInScope(user, studyId);

    const notes = await this.prisma.informationNote.findMany({
      where: { studyId: study.id },
      orderBy: { createdAt: 'asc' },
      include: {
        author: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { versions: true } },
      },
    });

    return notes.map((note) => ({
      id: note.id,
      author: {
        id: note.author.id,
        displayName: displayName(note.author),
        // The stored role, not the author's current one — see the schema note.
        role: note.authorRole as UserRole,
      },
      content: note.currentContent,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
      versionCount: note._count.versions,
    }));
  }

  async create(
    user: AuthenticatedUser,
    studyId: string,
    content: string,
  ): Promise<CreatedInformationNote> {
    const study = await this.findStudyInScope(user, studyId);

    // The note and its first version are one fact, so they commit together.
    const note = await this.prisma.$transaction(async (tx) => {
      const created = await tx.informationNote.create({
        data: {
          studyId: study.id,
          authorUserId: user.id,
          authorRole: user.role as UserRole,
          currentContent: content,
          // Creating a note IS version 1, so a note that is never edited still
          // has a complete history rather than an empty one.
          versions: { create: { content, versionNumber: 1, createdBy: user.id } },
        },
      });

      await this.audit.record(
        {
          eventType: AuditEventType.INFORMATION_NOTE_ADDED,
          actor: { userId: user.id, role: user.role as UserRole },
          hospitalId: study.hospitalId,
          studyId: study.id,
          entityType: 'InformationNote',
          entityId: created.id,
        },
        tx,
      );

      return created;
    });

    return {
      id: note.id,
      content: note.currentContent,
      createdAt: note.createdAt.toISOString(),
    };
  }

  async update(
    user: AuthenticatedUser,
    noteId: string,
    content: string,
  ): Promise<CreatedInformationNote> {
    const note = await this.findNoteInScope(user, noteId);

    const isAuthor = note.authorUserId === user.id;
    if (!isAuthor && !NOTE_SUPERVISOR_ROLES.includes(user.role)) {
      throw new ForbiddenAppException(
        'Only the author, Operation or a Manager can edit an information note.',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Take the next number from the note's own history rather than from a
      // count, so two concurrent edits collide on the unique constraint
      // instead of silently producing two "version 2" rows.
      const latest = await tx.informationNoteVersion.findFirst({
        where: { noteId: note.id },
        orderBy: { versionNumber: 'desc' },
        select: { versionNumber: true },
      });

      await tx.informationNoteVersion.create({
        data: {
          noteId: note.id,
          content,
          versionNumber: (latest?.versionNumber ?? 0) + 1,
          createdBy: user.id,
        },
      });

      // Only the denormalized copy moves. Previous versions are untouched.
      const row = await tx.informationNote.update({
        where: { id: note.id },
        data: { currentContent: content },
      });

      await this.audit.record(
        {
          eventType: AuditEventType.INFORMATION_NOTE_UPDATED,
          actor: { userId: user.id, role: user.role as UserRole },
          hospitalId: note.study.hospitalId,
          studyId: note.studyId,
          entityType: 'InformationNote',
          entityId: note.id,
          // Who edited whose note matters for review; the content itself is in
          // the version row, so it is not duplicated here.
          metadata: { editedByAuthor: isAuthor, authorUserId: note.authorUserId },
        },
        tx,
      );

      return row;
    });

    return {
      id: updated.id,
      content: updated.currentContent,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  async listVersions(
    user: AuthenticatedUser,
    noteId: string,
  ): Promise<InformationNoteVersionDto[]> {
    const note = await this.findNoteInScope(user, noteId);

    const versions = await this.prisma.informationNoteVersion.findMany({
      where: { noteId: note.id },
      orderBy: { versionNumber: 'asc' },
      include: { creator: { select: { id: true, firstName: true, lastName: true } } },
    });

    return versions.map((version) => ({
      id: version.id,
      content: version.content,
      versionNumber: version.versionNumber,
      createdBy: { id: version.creator.id, displayName: displayName(version.creator) },
      createdAt: version.createdAt.toISOString(),
    }));
  }

  /** Knowing a study UUID is not access (docs/API_CONTRACT.md section 29). */
  private async findStudyInScope(user: AuthenticatedUser, studyId: string) {
    const study = await this.prisma.study.findUnique({
      where: { id: studyId },
      select: { id: true, hospitalId: true },
    });

    if (!study) {
      throw new NotFoundAppException('Study not found.');
    }

    this.hospitalScope.assertAllowed(user, study.hospitalId);
    return study;
  }

  private async findNoteInScope(user: AuthenticatedUser, noteId: string) {
    const note = await this.prisma.informationNote.findUnique({
      where: { id: noteId },
      include: { study: { select: { hospitalId: true } } },
    });

    if (!note) {
      throw new NotFoundAppException('Information note not found.');
    }

    // The note is reachable by its own id, so the study's hospital is checked
    // here too rather than trusting the caller to have come through the study.
    this.hospitalScope.assertAllowed(user, note.study.hospitalId);
    return note;
  }
}

function displayName(user: { firstName: string; lastName: string }): string {
  return `${user.firstName} ${user.lastName}`.trim();
}
