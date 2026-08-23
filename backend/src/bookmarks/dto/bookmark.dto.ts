import type { IsURLOptions } from 'validator';
import { Transform } from 'class-transformer';
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

/** These render as anchor hrefs, so javascript:/data: URLs would be stored XSS. */
const URL_RULES: IsURLOptions = {
  protocols: ['http', 'https'],
  require_protocol: true,
  require_tld: false, // http://localhost:3000/... is legitimate to bookmark
};

const OptionalNullable = () => ValidateIf((_o, v) => v !== null);

export class CreateBookmarkDto {
  @IsUrl(URL_RULES, { message: 'url must be an http(s) URL' })
  @MaxLength(2048)
  url!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @OptionalNullable()
  @IsString()
  @MaxLength(5000)
  notes?: string | null;

  /** Whether the caller may use this collection is authorisation, checked in the service. */
  @IsOptional()
  @OptionalNullable()
  @IsString()
  @IsNotEmpty()
  collectionId?: string | null;
}

/** PUT requires the full body; PATCH does not. Separate classes on purpose. */
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
  @OptionalNullable()
  @IsString()
  @MaxLength(5000)
  notes?: string | null;

  @IsOptional()
  @OptionalNullable()
  @IsString()
  @IsNotEmpty()
  collectionId?: string | null;
}

export class ListBookmarksQueryDto extends ListQueryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  collectionId?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  uncategorised?: boolean;
}
