import { Injectable } from '@nestjs/common';
import { StudyStatus } from '@radiology/shared';
import { PrismaService } from '../prisma/prisma.service';
import { WorkflowService } from '../workflow/workflow.service';
import { AuditService } from '../audit/audit.service';
import { AuditEventType } from '../audit/audit.types';
import { HospitalScopeService } from '../auth/hospital-scope.service';
import { NotFoundAppException } from '../common/errors/app.exception';
import { AppLogger } from '../common/logging/app-logger.service';
import type { AuthenticatedUser } from '../auth/auth.types';

export interface ImagesAvailableResult {
  studyId: string;
  status: StudyStatus;
  imagesAvailableAt: string;
}

/**
 * "Images are available" (TASK_QUEUE BACKEND-013).
 *
 * In production this is driven by PACS (docs/INTEGRATIONS.md section 25); the
 * pilot dev-tools endpoint simulates that event and lands in exactly this
 * service, so the simulated path and the real path share one implementation
 * (docs/WORKFLOW_STATE_MACHINE.md section 47).
 */
@Injectable()
export class StudyImagesService {
  private readonly logger: AppLogger;

  constructor(
    private readonly prisma: PrismaService,
    private readonly workflow: WorkflowService,
    private readonly audit: AuditService,
    private readonly hospitalScope: HospitalScopeService,
    logger: AppLogger,
  ) {
    this.logger = logger.child(StudyImagesService.name);
  }

  async markImagesAvailable(
    user: AuthenticatedUser,
    studyId: string,
    input: { studyInstanceUid?: string } = {},
  ): Promise<ImagesAvailableResult> {
    const study = await this.prisma.study.findUnique({
      where: { id: studyId },
      select: { id: true, hospitalId: true, patientId: true, status: true },
    });

    if (!study) {
      throw new NotFoundAppException('Study not found.');
    }

    this.hospitalScope.assertAllowed(user, study.hospitalId);

    const imagesAvailableAt = new Date();

    // An invalid current state is refused by the workflow service, so this
    // endpoint cannot be used to jump a study into UNREAD from anywhere.
    const result = await this.prisma.$transaction(async (tx) => {
      await this.audit.record(
        {
          eventType: AuditEventType.IMAGES_AVAILABLE,
          actor: { userId: user.id, role: user.role },
          hospitalId: study.hospitalId,
          patientId: study.patientId,
          studyId: study.id,
          entityType: 'Study',
          entityId: study.id,
          metadata: { studyInstanceUid: input.studyInstanceUid },
        },
        tx,
      );

      return this.workflow.transition(
        study.id,
        StudyStatus.UNREAD,
        {
          actorUserId: user.id,
          actorRole: user.role,
          reason: 'Images available',
          studyData: {
            imagesAvailableAt,
            ...(input.studyInstanceUid ? { studyInstanceUid: input.studyInstanceUid } : {}),
          },
        },
        tx,
      );
    });

    this.logger.info({ message: 'Images available', studyId: study.id });

    return {
      studyId: study.id,
      status: result.toStatus,
      imagesAvailableAt: imagesAvailableAt.toISOString(),
    };
  }
}
