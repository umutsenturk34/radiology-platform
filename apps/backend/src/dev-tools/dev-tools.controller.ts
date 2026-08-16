import { Body, Controller, HttpCode, HttpStatus, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ParseUUIDPipe } from '@nestjs/common';
import { UserRole } from '@radiology/shared';
import { DevToolsGuard } from './dev-tools.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { HospitalScopeService } from '../auth/hospital-scope.service';
import { IntegrationRegistryService } from '../integrations/integration-registry.service';
import { Hl7Service } from '../integrations/hl7/hl7.service';
import { StudyImagesService } from '../studies/study-images.service';
import { MockHbysAdapter } from '../integrations/hbys/mock-hbys.adapter';
import { SetMockHbysModeDto } from './dto/mock-hbys.dto';
import { ValidationAppException } from '../common/errors/app.exception';
import type { AuthenticatedUser } from '../auth/auth.types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const studyIdPipe = new ParseUUIDPipe({
  version: '4',
  exceptionFactory: () => new ValidationAppException({ studyId: ['studyId must be a UUID.'] }),
});

/**
 * Pilot dev tools (TASK_QUEUE BACKEND-011, 012, 013, 050).
 *
 * These endpoints only produce the external events a hospital would send; they
 * then run the real adapter, the real HL7 application service and the real
 * workflow service. None of them writes a study status directly
 * (CLAUDE.md section 37).
 *
 * Two independent conditions gate every route: `DEV_TOOLS_ENABLED=true` and the
 * MANAGER role (docs/AUTH_ROLES_PERMISSIONS.md section 81).
 */
@UseGuards(DevToolsGuard)
@Roles(UserRole.MANAGER)
@Controller('dev-tools')
export class DevToolsController {
  constructor(
    private readonly registry: IntegrationRegistryService,
    private readonly hl7Service: Hl7Service,
    private readonly studyImages: StudyImagesService,
    private readonly hospitalScope: HospitalScopeService,
    private readonly mockHbys: MockHbysAdapter,
  ) {}

  /**
   * `PUT /dev-tools/mock-hbys` (docs/API_CONTRACT.md section 98).
   *
   * Switches the mock adapter between SUCCESS, FAIL and TIMEOUT so the failure
   * and retry paths can be exercised deterministically.
   */
  @Put('mock-hbys')
  @HttpCode(HttpStatus.OK)
  async setMockHbysMode(@Body() dto: SetMockHbysModeDto) {
    return { mode: await this.mockHbys.setMode(dto.mode) };
  }

  /**
   * Body is intentionally untyped: it stands in for a hospital HL7 payload, and
   * validating it here would duplicate the adapter's job. The only field this
   * controller needs itself is `hospitalId`, to pick the adapter.
   */
  @Post('hl7/first')
  @HttpCode(HttpStatus.CREATED)
  async firstHl7(@CurrentUser() user: AuthenticatedUser, @Body() body: Record<string, unknown>) {
    const hospitalId = this.requireHospitalId(user, body);
    const adapter = this.registry.getHl7Adapter(hospitalId);

    const event = adapter.parseFirstEvent(body, { hospitalId });

    return this.hl7Service.processFirstEvent(event);
  }

  @Post('hl7/second')
  @HttpCode(HttpStatus.OK)
  async secondHl7(@CurrentUser() user: AuthenticatedUser, @Body() body: Record<string, unknown>) {
    const hospitalId = this.requireHospitalId(user, body);
    const adapter = this.registry.getHl7Adapter(hospitalId);

    const event = adapter.parseSecondEvent(body, { hospitalId });

    return this.hl7Service.processSecondEvent(event);
  }

  @Post('studies/:studyId/images-available')
  @HttpCode(HttpStatus.OK)
  async imagesAvailable(
    @CurrentUser() user: AuthenticatedUser,
    @Param('studyId', studyIdPipe) studyId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const studyInstanceUid =
      typeof body?.studyInstanceUid === 'string' ? body.studyInstanceUid.trim() : undefined;

    return this.studyImages.markImagesAvailable(user, studyId, {
      studyInstanceUid: studyInstanceUid || undefined,
    });
  }

  private requireHospitalId(user: AuthenticatedUser, body: Record<string, unknown>): string {
    const hospitalId = typeof body?.hospitalId === 'string' ? body.hospitalId.trim() : '';

    if (!UUID_PATTERN.test(hospitalId)) {
      throw new ValidationAppException({ hospitalId: ['hospitalId must be a UUID.'] });
    }

    // Dev tools are Manager-only, and Manager sees every hospital, but the
    // check stays so the rule does not depend on that coincidence.
    this.hospitalScope.assertAllowed(user, hospitalId);

    return hospitalId;
  }
}
