import { Transform } from 'class-transformer';
import type { IsURLOptions } from 'validator';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ListQueryDto } from '../../common/dto/list-query.dto.js';

/**
 * Protocol allow-list is a real control, not decoration: these URLs are rendered as
 * anchor hrefs in the frontend, and `javascript:` / `data:` hrefs are stored XSS.
 * Rejecting them at the write boundary means the frontend cannot be the only thing
 * standing between a stored value and script execution.
 */
const URL_RULES: IsURLOptions = {
  protocols: ['http', 'https'],
  require_protocol: true,
  require_tld: false, // allow http://localhost:3000/... which is legitimate to bookmark
};

export class CreateBookmarkDto {
  @IsUrl(URL_RULES, { message: 'url must be an http(s) URL' })
  @MaxLength(2048)
  url!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(5000)
  notes?: string | null;

  /**
   * Nullable on purpose — an uncategorised bookmark is legal. Whether the caller may
   * actually use this collection id is NOT a validation concern; it is an authorisation
   * one, checked against the caller's own collections in BookmarksService.
   */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @IsNotEmpty()
  collectionId?: string | null;
}

export class ReplaceBookmarkDto extends CreateBookmarkDto {}

export class PatchBookmarkDto {
  @IsOptional()
  @IsUrl(URL_RULES, { message: 'url must be an http(s) URL' })
  @MaxLength(2048)
  url?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(5000)
  notes?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @IsNotEmpty()
  collectionId?: string | null;
}

export class ListBookmarksQueryDto extends ListQueryDto {
  /** Filter to one collection. Must be a collection the caller owns, else 404. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  collectionId?: string;

  /** `?uncategorised=true` returns only bookmarks with no collection. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  uncategorised?: boolean;
}
