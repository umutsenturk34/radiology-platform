import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

const MAX_REPORT_LENGTH = 100_000;

/** `PUT /studies/:id/report/approval-draft` (API_CONTRACT section 59). */
export class SaveApprovalDraftDto {
  @IsString({ message: 'Content must be a string.' })
  @MaxLength(MAX_REPORT_LENGTH, { message: 'The report is too long.' })
  content: string;
}

/**
 * `POST /studies/:id/return-to-reporter` (API_CONTRACT section 60).
 *
 * The reason is mandatory: the reporter has to know what to change.
 */
export class ReturnToReporterDto {
  @IsString({ message: 'Reason must be a string.' })
  @IsNotEmpty({ message: 'Reason is required.' })
  @MaxLength(1000, { message: 'Reason must be at most 1000 characters.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  reason: string;
}

/** `POST /studies/:id/finalize` (API_CONTRACT section 61). */
export class FinalizeReportDto {
  // Optional: omitting it approves the current version as it stands.
  @IsOptional()
  @IsString({ message: 'Content must be a string.' })
  @MaxLength(MAX_REPORT_LENGTH, { message: 'The report is too long.' })
  content?: string;
}
