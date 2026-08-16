import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

/** `POST /studies/:id/dictations` (docs/API_CONTRACT.md section 38). */
export class CreateDictationDto {
  /** e.g. `audio/webm;codecs=opus`. Optional: the upload can supply it. */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  mimeType?: string;
}

/** Multipart fields accompanying `POST /dictations/:id/upload`. */
export class UploadDictationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'durationMs must be an integer.' })
  @Min(0)
  // 6 hours: high enough never to reject a real dictation, low enough to
  // reject an obviously wrong client value.
  @Max(6 * 60 * 60 * 1000)
  durationMs?: number;
}
