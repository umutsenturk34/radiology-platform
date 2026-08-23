import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { PacsService } from './pacs.service';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ValidationAppException } from '../../common/errors/app.exception';
import type { AuthenticatedUser } from '../../auth/auth.types';

const studyIdPipe = new ParseUUIDPipe({
  version: '4',
  exceptionFactory: () => new ValidationAppException({ studyId: ['studyId must be a UUID.'] }),
});

/**
 * PACS viewer and series (docs/API_CONTRACT.md sections 36 and 37).
 *
 * Readable by any authenticated role with access to the study's hospital: a
 * reporter needs the images as much as the doctor does. Hospital scope is
 * enforced in the service, which has the study loaded.
 */
@Controller('studies/:studyId/pacs')
export class PacsController {
  constructor(private readonly pacs: PacsService) {}

  @Get('viewer')
  async viewer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('studyId', studyIdPipe) studyId: string,
  ) {
    return this.pacs.getViewer(user, studyId);
  }

  @Get('series')
  async series(
    @CurrentUser() user: AuthenticatedUser,
    @Param('studyId', studyIdPipe) studyId: string,
  ) {
    return this.pacs.listSeries(user, studyId);
  }
}
