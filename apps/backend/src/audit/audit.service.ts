import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuditEntry } from './audit.types';

/**
 * Central audit writer (CLAUDE.md section 33).
 *
 * Audit rows are append-only: this service offers no update or delete, so no
 * normal API flow can rewrite history (docs/DATA_MODEL.md section 68).
 *
 * `record` takes an optional transaction client so a workflow transition and
 * its audit row commit together (WORKFLOW_STATE_MACHINE section 43).
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;

    await client.auditLog.create({
      data: {
        eventType: entry.eventType,
        actorUserId: entry.actor?.userId,
        actorRole: entry.actor?.role,
        hospitalId: entry.hospitalId,
        patientId: entry.patientId,
        studyId: entry.studyId,
        entityType: entry.entityType,
        entityId: entry.entityId,
        metadata: (entry.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
      },
    });
  }
}
