import { Injectable } from '@nestjs/common';
import type { StudyPacsSeries, StudyPacsViewer } from '@radiology/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { HospitalScopeService } from '../../auth/hospital-scope.service';
import { NotFoundAppException } from '../../common/errors/app.exception';
import { AppLogger } from '../../common/logging/app-logger.service';
import { IntegrationRegistryService } from '../integration-registry.service';
import type { PacsStudyLookup } from '../contracts/pacs.contract';
import type { AuthenticatedUser } from '../../auth/auth.types';

/**
 * Core PACS reads (TASK_QUEUE BACKEND-020).
 *
 * Nothing vendor-specific appears here: this service resolves the study, checks
 * hospital scope, asks whichever adapter the registry returns, and maps the
 * answer to the API contract. Swapping the test adapter for Orthanc changes no
 * line in this file (BACKEND-019 acceptance).
 */
@Injectable()
export class PacsService {
  private readonly logger: AppLogger;

  constructor(
    private readonly prisma: PrismaService,
    private readonly hospitalScope: HospitalScopeService,
    private readonly registry: IntegrationRegistryService,
    logger: AppLogger,
  ) {
    this.logger = logger.child(PacsService.name);
  }

  async getViewer(user: AuthenticatedUser, studyId: string): Promise<StudyPacsViewer> {
    const { lookup, study } = await this.resolveStudy(user, studyId);
    const adapter = this.registry.getPacsAdapter(study.hospitalId);

    const access = await adapter.getViewerAccess({ ...lookup, userId: user.id });

    if (!access.available) {
      // Not an error response: "no viewer" is a legitimate answer the client
      // has to render (CLAUDE.md section 30 — never fake success).
      this.logger.log({
        message: 'PACS viewer unavailable',
        studyId,
        reason: access.reason ?? 'UNKNOWN',
      });
    }

    await this.rememberStudyInstanceUid(study, access.studyInstanceUid);

    return {
      available: access.available,
      viewerUrl: access.viewerUrl,
      expiresAt: access.expiresAt,
      studyInstanceUid: access.studyInstanceUid,
      ...(access.reason ? { reason: access.reason } : {}),
    };
  }

  async listSeries(user: AuthenticatedUser, studyId: string): Promise<StudyPacsSeries[]> {
    const { lookup, study } = await this.resolveStudy(user, studyId);
    const adapter = this.registry.getPacsAdapter(study.hospitalId);

    const series = await adapter.listSeries(lookup);

    return series.map((entry) => ({
      seriesInstanceUid: entry.seriesInstanceUid,
      seriesNumber: entry.seriesNumber,
      seriesDescription: entry.seriesDescription,
      modality: entry.modality,
      imageCount: entry.imageCount,
    }));
  }

  private async resolveStudy(
    user: AuthenticatedUser,
    studyId: string,
  ): Promise<{ lookup: PacsStudyLookup; study: StudyRow }> {
    const study = await this.prisma.study.findUnique({
      where: { id: studyId },
      select: { id: true, hospitalId: true, accessionNumber: true, studyInstanceUid: true },
    });

    if (!study) {
      throw new NotFoundAppException('Study not found.');
    }

    this.hospitalScope.assertAllowed(user, study.hospitalId);

    return {
      study,
      lookup: {
        hospitalId: study.hospitalId,
        accessionNumber: study.accessionNumber,
        studyInstanceUid: study.studyInstanceUid,
      },
    };
  }

  /**
   * Keeps the UID PACS resolved (docs/INTEGRATIONS.md section 22 — the platform
   * may hold identifiers, never the images).
   *
   * Only fills a blank. An existing UID is never overwritten: it is the link
   * between this study and the images, and a differing answer from PACS is a
   * matching problem to investigate rather than something to silently apply.
   */
  private async rememberStudyInstanceUid(
    study: StudyRow,
    resolved: string | null,
  ): Promise<void> {
    if (!resolved || study.studyInstanceUid) return;

    await this.prisma.study.update({
      where: { id: study.id },
      data: { studyInstanceUid: resolved },
    });
  }
}

interface StudyRow {
  id: string;
  hospitalId: string;
  accessionNumber: string;
  studyInstanceUid: string | null;
}
