import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

/** `POST /studies/:id/image-missing/resolve` body (docs/API_CONTRACT.md section 47). */
export class ResolveImageMissingDto {
  @IsOptional()
  @IsString({ message: 'Resolution note must be a string.' })
  @MaxLength(1000, { message: 'Resolution note must be at most 1000 characters.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value))
  resolutionNote?: string;
}
