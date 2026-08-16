import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * `POST /hbys-deliveries/:id/retry` (docs/API_CONTRACT.md section 66).
 *
 * The reason is recorded in the audit entry: a manual retry is an operational
 * decision and should be explainable afterwards.
 */
export class RetryHbysDeliveryDto {
  @IsString({ message: 'Reason must be a string.' })
  @IsNotEmpty({ message: 'Reason is required.' })
  @MaxLength(500, { message: 'Reason must be at most 500 characters.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  reason: string;
}
