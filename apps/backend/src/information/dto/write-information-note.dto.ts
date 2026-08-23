import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** Upper bound on a single note, generous but not unbounded. */
const MAX_CONTENT_LENGTH = 4000;

/**
 * Body for both create and update (docs/API_CONTRACT.md sections 69 and 70) —
 * the two take the same single field, so they share one DTO.
 */
export class WriteInformationNoteDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'content must be a string.' })
  // Trimmed first, so a note of nothing but whitespace is rejected rather than
  // stored as an empty note.
  @MinLength(1, { message: 'content must not be empty.' })
  @MaxLength(MAX_CONTENT_LENGTH, {
    message: `content must be at most ${MAX_CONTENT_LENGTH} characters.`,
  })
  content!: string;
}
