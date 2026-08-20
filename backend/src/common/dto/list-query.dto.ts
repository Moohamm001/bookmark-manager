import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Shared list parameters. Documented in API_DESIGN.md. */
export class ListQueryDto {
  /** Free-text search. Scope depends on the resource; see the subclasses. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @Transform(({ value }) => Number.parseInt(String(value), 10))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 25;

  @IsOptional()
  @Transform(({ value }) => Number.parseInt(String(value), 10))
  @IsInt()
  @Min(0)
  offset?: number = 0;

  @IsOptional()
  @IsIn(['createdAt', 'updatedAt', 'title', 'name'])
  sortBy?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc' = 'desc';
}
