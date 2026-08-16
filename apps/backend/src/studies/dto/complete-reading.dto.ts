import { IsOptional, IsUUID } from 'class-validator';

/**
 * `POST /studies/:id/complete-reading` (docs/API_CONTRACT.md section 43).
 *
 * `dictationId` is optional: when omitted the backend accepts any completed
 * dictation on the study, which keeps a client that lost track of the id from
 * being unable to finish a reading that clearly has audio.
 */
export class CompleteReadingDto {
  @IsOptional()
  @IsUUID('4', { message: 'dictationId must be a UUID.' })
  dictationId?: string;
}
