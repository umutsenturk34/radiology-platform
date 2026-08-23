import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { InformationService } from './information.service';
import { WriteInformationNoteDto } from './dto/write-information-note.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ValidationAppException } from '../common/errors/app.exception';
import type { AuthenticatedUser } from '../auth/auth.types';

const uuidPipe = (field: string) =>
  new ParseUUIDPipe({
    version: '4',
    exceptionFactory: () => new ValidationAppException({ [field]: [`${field} must be a UUID.`] }),
  });

/**
 * Information notes (docs/API_CONTRACT.md sections 68-72).
 *
 * There is deliberately no DELETE route. Section 71 states the endpoint does
 * not exist, and note history survives even a Manager
 * (AUTH_ROLES_PERMISSIONS.md). Its absence here is the enforcement.
 *
 * No `@Roles` on any route: all four roles may read and write notes
 * (AUTH_ROLES_PERMISSIONS.md section 65 and the permission matrix row "Add
 * information note"). Hospital scope and note authorship are the real limits,
 * and both need the loaded row, so the service enforces them.
 */
@Controller()
export class InformationController {
  constructor(private readonly information: InformationService) {}

  @Get('studies/:studyId/information')
  async listForStudy(
    @CurrentUser() user: AuthenticatedUser,
    @Param('studyId', uuidPipe('studyId')) studyId: string,
  ) {
    return this.information.listForStudy(user, studyId);
  }

  @Post('studies/:studyId/information')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('studyId', uuidPipe('studyId')) studyId: string,
    @Body() body: WriteInformationNoteDto,
  ) {
    return this.information.create(user, studyId, body.content);
  }

  @Put('information/:noteId')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('noteId', uuidPipe('noteId')) noteId: string,
    @Body() body: WriteInformationNoteDto,
  ) {
    return this.information.update(user, noteId, body.content);
  }

  @Get('information/:noteId/versions')
  async listVersions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('noteId', uuidPipe('noteId')) noteId: string,
  ) {
    return this.information.listVersions(user, noteId);
  }
}
