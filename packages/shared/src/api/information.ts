import type { UserRole } from '../enums/user';

/**
 * Information note contracts (docs/API_CONTRACT.md sections 68-72).
 *
 * There is no delete shape here on purpose: the API has no delete endpoint
 * and notes accumulate history instead of being removed (section 71).
 */

export interface InformationNoteAuthor {
  id: string;
  displayName: string;
  /** The role the author held when the note was written, not their role today. */
  role: UserRole;
}

export interface InformationNoteDto {
  id: string;
  author: InformationNoteAuthor;
  /** The newest content. Earlier content stays available through `versions`. */
  content: string;
  createdAt: string;
  updatedAt: string;
  /** How many versions exist; 1 for a note that has never been edited. */
  versionCount: number;
}

/** What POST returns — the note as just created (section 69). */
export interface CreatedInformationNote {
  id: string;
  content: string;
  createdAt: string;
}

export interface InformationNoteVersionAuthor {
  id: string;
  displayName: string;
}

export interface InformationNoteVersionDto {
  id: string;
  content: string;
  /** Position in this note's history, starting at 1. */
  versionNumber: number;
  createdBy: InformationNoteVersionAuthor;
  createdAt: string;
}
