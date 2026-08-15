import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ParseUUIDPipe } from '@nestjs/common';
import { UserRole } from '@radiology/shared';
import { StudyActionsService } from './study-actions.service';
import { ForceReleaseLockDto } from './dto/force-release-lock.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ValidationAppException } from '../common/errors/app.exception';
import type { AuthenticatedUser } from '../auth/auth.types';

const studyIdPipe = new ParseUUIDPipe({
  version: '4',
  exceptionFactory: () => new ValidationAppException({ studyId: ['studyId must be a UUID.'] }),
});

/**
 * Doctor actions and lock endpoints
 * (docs/API_CONTRACT.md sections 30-35).
 *
 * `@Roles` is the coarse gate only; hospital scope, workflow state and lock
 * ownership are enforced in the service, which is where the resource is known
 * (docs/AUTH_ROLES_PERMISSIONS.md section 95).
 */
@Controller('studies')
export class StudyActionsController {
  constructor(private readonly actions: StudyActionsService) {}

  @Roles(UserRole.DOCTOR)
  @Post(':studyId/start-reading')
  @HttpCode(HttpStatus.OK)
  async startReading(
    @CurrentUser() user: AuthenticatedUser,
    @Param('studyId', studyIdPipe) studyId: string,
  ) {
    return this.actions.startReading(user, studyId);
  }

  @Get(':studyId/lock')
  async getLock(
    @CurrentUser() user: AuthenticatedUser,
    @Param('studyId', studyIdPipe) studyId: string,
  ) {
    return this.actions.getLock(user, studyId);
  }

  @Post(':studyId/lock/heartbeat')
  @HttpCode(HttpStatus.OK)
  async heartbeat(
    @CurrentUser() user: AuthenticatedUser,
    @Param('studyId', studyIdPipe) studyId: string,
  ) {
    return this.actions.heartbeat(user, studyId);
  }

  @Post(':studyId/lock/release')
  @HttpCode(HttpStatus.OK)
  async release(
    @CurrentUser() user: AuthenticatedUser,
    @Param('studyId', studyIdPipe) studyId: string,
  ) {
    return this.actions.releaseLock(user, studyId);
  }

  @Roles(UserRole.OPERATION, UserRole.MANAGER)
  @Post(':studyId/lock/force-release')
  @HttpCode(HttpStatus.OK)
  async forceRelease(
    @CurrentUser() user: AuthenticatedUser,
    @Param('studyId', studyIdPipe) studyId: string,
    @Body() dto: ForceReleaseLockDto,
  ) {
    return this.actions.forceReleaseLock(user, studyId, dto.reason);
  }
}
