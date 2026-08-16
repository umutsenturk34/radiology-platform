import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { UserRole } from '@radiology/shared';
import { DictationsService } from './dictations.service';
import { CreateDictationDto, UploadDictationDto } from './dto/create-dictation.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ValidationAppException } from '../common/errors/app.exception';
import type { AuthenticatedUser } from '../auth/auth.types';

const uuidPipe = (field: string) =>
  new ParseUUIDPipe({
    version: '4',
    exceptionFactory: () => new ValidationAppException({ [field]: [`${field} must be a UUID.`] }),
  });

/** Dictation endpoints (docs/API_CONTRACT.md sections 38-42). */
@Controller()
export class DictationsController {
  constructor(private readonly dictations: DictationsService) {}

  @Roles(UserRole.DOCTOR)
  @Post('studies/:studyId/dictations')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('studyId', uuidPipe('studyId')) studyId: string,
    @Body() dto: CreateDictationDto,
  ) {
    return this.dictations.create(user, studyId, dto);
  }

  /**
   * Multipart upload. Held in memory rather than written to a temp file: the
   * size cap is small, and the bytes go straight to object storage
   * (docs/API_CONTRACT.md sections 39 and 40).
   */
  @Roles(UserRole.DOCTOR)
  @Post('dictations/:dictationId/upload')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dictationId', uuidPipe('dictationId')) dictationId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadDictationDto,
  ) {
    if (!file) {
      throw new ValidationAppException({ file: ['An audio file is required.'] });
    }

    return this.dictations.upload(user, dictationId, file, dto);
  }

  @Get('studies/:studyId/dictations')
  async listForStudy(
    @CurrentUser() user: AuthenticatedUser,
    @Param('studyId', uuidPipe('studyId')) studyId: string,
  ) {
    return this.dictations.listForStudy(user, studyId);
  }

  @Get('dictations/:dictationId/playback')
  async playback(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dictationId', uuidPipe('dictationId')) dictationId: string,
  ) {
    return this.dictations.getPlaybackUrl(user, dictationId);
  }

  /**
   * Streams the audio.
   *
   * Public to the guard because an `<audio>` element cannot send an
   * Authorization header; the short-lived token in the query string carries the
   * authority, and the user's hospital scope is re-checked before any bytes are
   * written.
   */
  @Public()
  @Get('dictations/:dictationId/audio')
  async audio(
    @Param('dictationId', uuidPipe('dictationId')) dictationId: string,
    @Query('token') token: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const { stream, mimeType, size } = await this.dictations.streamAudio(dictationId, token);

    response.setHeader('Content-Type', mimeType);
    response.setHeader('Content-Length', size);
    // Clinical audio must not be cached by intermediaries.
    response.setHeader('Cache-Control', 'private, no-store');

    stream.pipe(response);
  }
}
