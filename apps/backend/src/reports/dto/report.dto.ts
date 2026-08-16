import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Upper bound on report text; generous, but not unbounded. */
const MAX_REPORT_LENGTH = 100_000;

/** `PUT /studies/:id/report/draft` (docs/API_CONTRACT.md section 53). */
export class SaveReportDraftDto {
  // An empty draft is allowed: autosave fires while the reporter is still
  // typing, and refusing it would make the client show a false save error.
  @IsString({ message: 'Content must be a string.' })
  @MaxLength(MAX_REPORT_LENGTH, { message: 'The report is too long.' })
  content: string;
}

/** `POST /studies/:id/submit-report` (docs/API_CONTRACT.md section 55). */
export class SubmitReportDto {
  // Optional: when omitted the last autosaved draft is submitted, so a client
  // that already saved does not have to resend the text.
  @IsOptional()
  @IsString({ message: 'Content must be a string.' })
  @MaxLength(MAX_REPORT_LENGTH, { message: 'The report is too long.' })
  content?: string;
}
