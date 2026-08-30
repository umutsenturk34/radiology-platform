import type { UserRole } from '../enums/user';

/** Information note contracts; normal workflow deliberately has no delete. */
export interface InformationNoteAuthor {
  id: string;
  displayName: string;
  role: UserRole;
}

export interface InformationNoteDto {
  id: string;
  author: InformationNoteAuthor;
  content: string;
  createdAt: string;
  updatedAt: string;
  versionCount: number;
}

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
  versionNumber: number;
  createdBy: InformationNoteVersionAuthor;
  createdAt: string;
}
