import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { StudiesService } from './studies.service';
import { ListStudiesDto } from './dto/list-studies.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ValidationAppException } from '../common/errors/app.exception';
import type { AuthenticatedUser } from '../auth/auth.types';

/**
 * Keeps a malformed id on the documented validation contract — 422
 * VALIDATION_ERROR with a field list — instead of the pipe's default 400
 * (docs/API_CONTRACT.md section 112).
 */
const studyIdPipe = new ParseUUIDPipe({
  version: '4',
  exceptionFactory: () => new ValidationAppException({ studyId: ['studyId must be a UUID.'] }),
});

/**
 * `/api/v1/studies` (docs/API_CONTRACT.md sections 23-29).
 *
 * Open to all four roles; what each of them actually sees is decided by
 * hospital scope inside the service, not by the route
 * (docs/AUTH_ROLES_PERMISSIONS.md section 59).
 */
@Controller('studies')
export class StudiesController {
  constructor(private readonly studiesService: StudiesService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListStudiesDto) {
    // Already shaped as { data, meta }; the envelope interceptor passes it through.
    return this.studiesService.list(user, query);
  }

  @Get(':studyId')
  async getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('studyId', studyIdPipe) studyId: string,
  ) {
    return this.studiesService.getById(user, studyId);
  }
}
