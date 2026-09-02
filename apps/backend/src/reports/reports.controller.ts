import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { UserRole } from '@radiology/shared';
import { ReportsService } from './reports.service';
import { ApprovalService } from './approval.service';
import { SaveReportDraftDto, SubmitReportDto } from './dto/report.dto';
import {
  FinalizeReportDto,
  ReturnToReporterDto,
  SaveApprovalDraftDto,
} from './dto/approval.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ValidationAppException } from '../common/errors/app.exception';
import type { AuthenticatedUser } from '../auth/auth.types';

const studyIdPipe = new ParseUUIDPipe({
  version: '4',
  exceptionFactory: () => new ValidationAppException({ studyId: ['studyId must be a UUID.'] }),
});

/**
 * Reporter workflow endpoints (docs/API_CONTRACT.md sections 50-56 and 81).
 *
 * Reading the report is open to every role with hospital access; writing is
 * REPORTER plus lock ownership, enforced in the service.
 */
@Controller('studies')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly approval: ApprovalService,
  ) {}

  @Roles(UserRole.REPORTER)
  @Post(':studyId/start-transcription')
  @HttpCode(HttpStatus.OK)
  async startTranscription(
    @CurrentUser() user: AuthenticatedUser,
    @Param('studyId', studyIdPipe) studyId: string,
  ) {
    return this.reports.startTranscription(user, studyId);
  }

  @Get(':studyId/report')
  async getReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('studyId', studyIdPipe) studyId: string,
  ) {
    return this.reports.getReport(user, studyId);
  }

  /**
   * No `@Roles`: every role may read the history of a study in their hospital
   * scope (docs/AUTH_ROLES_PERMISSIONS.md section 91). Scope is the limit, and
   * the service enforces it.
   */
  @Get(':studyId/report/versions')
  async getReportVersions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('studyId', studyIdPipe) studyId: string,
  ) {
    return this.reports.listVersions(user, studyId);
  }

  @Roles(UserRole.REPORTER)
  @Put(':studyId/report/draft')
  @HttpCode(HttpStatus.OK)
  async saveDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('studyId', studyIdPipe) studyId: string,
    @Body() dto: SaveReportDraftDto,
  ) {
    return this.reports.saveDraft(user, studyId, dto.content);
  }

  @Roles(UserRole.REPORTER)
  @Post(':studyId/submit-report')
  @HttpCode(HttpStatus.OK)
  async submitReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('studyId', studyIdPipe) studyId: string,
    @Body() dto: SubmitReportDto,
  ) {
    return this.reports.submitReport(user, studyId, dto.content);
  }

  @Roles(UserRole.DOCTOR)
  @Post(':studyId/start-approval')
  @HttpCode(HttpStatus.OK)
  async startApproval(
    @CurrentUser() user: AuthenticatedUser,
    @Param('studyId', studyIdPipe) studyId: string,
  ) {
    return this.approval.startApproval(user, studyId);
  }

  @Roles(UserRole.DOCTOR)
  @Put(':studyId/report/approval-draft')
  @HttpCode(HttpStatus.OK)
  async saveApprovalDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('studyId', studyIdPipe) studyId: string,
    @Body() dto: SaveApprovalDraftDto,
  ) {
    return this.approval.saveApprovalDraft(user, studyId, dto.content);
  }

  @Roles(UserRole.DOCTOR)
  @Post(':studyId/return-to-reporter')
  @HttpCode(HttpStatus.OK)
  async returnToReporter(
    @CurrentUser() user: AuthenticatedUser,
    @Param('studyId', studyIdPipe) studyId: string,
    @Body() dto: ReturnToReporterDto,
  ) {
    return this.approval.returnToReporter(user, studyId, dto.reason);
  }

  @Roles(UserRole.DOCTOR)
  @Post(':studyId/finalize')
  @HttpCode(HttpStatus.OK)
  async finalize(
    @CurrentUser() user: AuthenticatedUser,
    @Param('studyId', studyIdPipe) studyId: string,
    @Body() dto: FinalizeReportDto,
  ) {
    return this.approval.finalize(user, studyId, dto.content);
  }
}
