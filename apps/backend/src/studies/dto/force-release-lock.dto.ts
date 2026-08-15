import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * `POST /studies/:id/lock/force-release` body
 * (docs/API_CONTRACT.md section 35).
 *
 * The reason is mandatory: taking a lock away from another user is exceptional
 * recovery and must be explainable afterwards (CLAUDE.md section 18).
 */
export class ForceReleaseLockDto {
  // Distinct messages per constraint: class-validator reports every failing
  // rule, and repeating one reads like a bug to the client.
  @IsString({ message: 'Reason must be a string.' })
  @IsNotEmpty({ message: 'Reason is required.' })
  @MaxLength(500, { message: 'Reason must be at most 500 characters.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  reason: string;
}
