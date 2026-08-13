import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HealthService } from './health.service';

/**
 * `GET /api/v1/health`
 *
 * Unauthenticated on purpose: platform health checks (Railway) must be able to
 * probe it. It exposes no patient, user or hospital data.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async check(@Res({ passthrough: true }) response: Response) {
    const report = await this.healthService.check();

    // A degraded dependency must be visible to the platform, not hidden behind 200.
    if (report.status === 'degraded') {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return report;
  }
}
