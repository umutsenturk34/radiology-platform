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
import { SaveReportDraftDto, SubmitReportDto } from './dto/report.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ValidationAppException } from '../common/errors/app.exception';
import type { AuthenticatedUser } from '../auth/auth.types';

const studyIdPipe = new ParseUUIDPipe({
  version: '4',
  exceptionFactory: () => new ValidationAppException({ studyId: ['studyId must be a UUID.'] }),
});

/**
 * Reporter workflow endpoints (docs/API_CONTRACT.md sections 50-56).
 *
 * Reading the report is open to every role with hospital access; writing is
 * REPORTER plus lock ownership, enforced in the service.
 */
@Controller('studies')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

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
}
