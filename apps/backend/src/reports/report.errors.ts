import { HttpStatus } from '@nestjs/common';
import { ApiErrorCode } from '@radiology/shared';
import { AppException } from '../common/errors/app.exception';

/**
 * 409 — the current version is history and cannot be edited in place.
 *
 * A completed or finalized version is preserved; changing the text means
 * creating a new version (CLAUDE.md section 21).
 */
export class ReportNotEditableException extends AppException {
  constructor(currentStatus: string) {
    super(
      ApiErrorCode.CONFLICT,
      'This report version can no longer be edited; a new version is required.',
      HttpStatus.CONFLICT,
      { currentStatus },
    );
  }
}

/** 422 — an empty report must not reach the doctor's approval queue. */
export class EmptyReportException extends AppException {
  constructor() {
    super(ApiErrorCode.VALIDATION_ERROR, 'The report is empty.', HttpStatus.UNPROCESSABLE_ENTITY, {
      fields: { content: ['The report content cannot be empty.'] },
    });
  }
}
