import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { UserRole } from '@radiology/shared';
import { HbysDeliveryService } from './hbys-delivery.service';
import { RetryHbysDeliveryDto } from './dto/retry-hbys.dto';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ValidationAppException } from '../../common/errors/app.exception';
import type { AuthenticatedUser } from '../../auth/auth.types';

const uuidPipe = (field: string) =>
  new ParseUUIDPipe({
    version: '4',
    exceptionFactory: () => new ValidationAppException({ [field]: [`${field} must be a UUID.`] }),
  });

/** HBYS delivery visibility and manual retry (API_CONTRACT sections 64-67). */
@Controller()
export class HbysController {
  constructor(private readonly deliveries: HbysDeliveryService) {}

  /**
   * Readable by any role with hospital access: an HBYS failure must be visible
   * where the study is, not only in an operations screen
   * (CLAUDE.md section 25).
   */
  @Get('studies/:studyId/hbys-deliveries')
  async listForStudy(
    @CurrentUser() user: AuthenticatedUser,
    @Param('studyId', uuidPipe('studyId')) studyId: string,
  ) {
    return this.deliveries.listForStudy(user, studyId);
  }

  @Roles(UserRole.OPERATION, UserRole.MANAGER)
  @Get('hbys-deliveries/:deliveryId/attempts')
  async listAttempts(
    @CurrentUser() user: AuthenticatedUser,
    @Param('deliveryId', uuidPipe('deliveryId')) deliveryId: string,
  ) {
    return this.deliveries.listAttempts(user, deliveryId);
  }

  @Roles(UserRole.OPERATION, UserRole.MANAGER)
  @Post('hbys-deliveries/:deliveryId/retry')
  @HttpCode(HttpStatus.OK)
  async retry(
    @CurrentUser() user: AuthenticatedUser,
    @Param('deliveryId', uuidPipe('deliveryId')) deliveryId: string,
    @Body() dto: RetryHbysDeliveryDto,
  ) {
    return this.deliveries.manualRetry(user, deliveryId, dto.reason);
  }
}
