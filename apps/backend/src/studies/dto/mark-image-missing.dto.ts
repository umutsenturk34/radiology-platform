import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * `POST /studies/:id/image-missing` body (docs/API_CONTRACT.md section 46).
 *
 * The reason is mandatory: operations decide what to chase from it, and the
 * incident is the only place it is kept (AUTH_ROLES_PERMISSIONS section 12).
 */
export class MarkImageMissingDto {
  @IsString({ message: 'Reason must be a string.' })
  @IsNotEmpty({ message: 'Reason is required.' })
  @MaxLength(1000, { message: 'Reason must be at most 1000 characters.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  reason: string;
}
