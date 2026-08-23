import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  PATIENT_CATEGORIES,
  SLA_STATES,
  SortOrder,
  STUDY_POOLS,
  STUDY_SORT_FIELDS,
  STUDY_STATUSES,
  StudySortField,
  type PatientCategory,
  type SlaState,
  type StudyPool,
  type StudyStatus,
} from '@radiology/shared';

/** Upper bound on the free-text search term. */
const MAX_SEARCH_LENGTH = 128;

/**
 * `GET /api/v1/studies` query parameters (docs/API_CONTRACT.md sections 15,
 * 16, 23 and 25).
 *
 * Unknown parameters are rejected by the global validation pipe, so a typo in a
 * filter fails loudly instead of silently widening the result set.
 */
export class ListStudiesDto {
  @IsOptional()
  @IsUUID('4', { message: 'hospitalId must be a UUID.' })
  hospitalId?: string;

  @IsOptional()
  @IsIn(STUDY_STATUSES, { message: 'status is not a known study status.' })
  status?: StudyStatus;

  @IsOptional()
  @IsIn(PATIENT_CATEGORIES, { message: 'category is not a known patient category.' })
  category?: PatientCategory;

  @IsOptional()
  @IsIn(STUDY_POOLS, { message: 'pool is not a known study pool.' })
  pool?: StudyPool;

  /**
   * Derived SLA state, the way Operation finds studies at risk
   * (docs/API_CONTRACT.md section 92). Not a stored column: the service turns
   * it into a deadline comparison.
   */
  @IsOptional()
  @IsIn(SLA_STATES, { message: 'slaState is not a known SLA state.' })
  slaState?: SlaState;

  /** A UUID, or the literal `me` meaning the caller (API_CONTRACT section 57). */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  assignedDoctorId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  assignedReporterId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_SEARCH_LENGTH)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page must be an integer.' })
  @Min(1, { message: 'page must be at least 1.' })
  page: number = DEFAULT_PAGE;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pageSize must be an integer.' })
  @Min(1, { message: 'pageSize must be at least 1.' })
  @Max(MAX_PAGE_SIZE, { message: `pageSize must be at most ${MAX_PAGE_SIZE}.` })
  pageSize: number = DEFAULT_PAGE_SIZE;

  @IsOptional()
  @IsIn(STUDY_SORT_FIELDS, { message: 'sortBy is not a sortable field.' })
  sortBy: StudySortField = StudySortField.ARRIVAL_AT;

  @IsOptional()
  @IsIn([SortOrder.ASC, SortOrder.DESC], { message: 'sortOrder must be asc or desc.' })
  // FIFO reads the oldest arrival first, so ascending is the pilot default
  // (TASK_QUEUE BACKEND-009).
  sortOrder: SortOrder = SortOrder.ASC;
}
