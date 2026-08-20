import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ListQueryDto } from '../../common/dto/list-query.dto.js';

/**
 * POST and PUT share this: both require the FULL resource. PATCH has its own DTO with
 * every field optional. They are deliberately not the same class — reusing one DTO with
 * `PartialType` everywhere is how PUT quietly starts accepting partial bodies.
 */
export class CreateCollectionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;
}

export class ReplaceCollectionDto extends CreateCollectionDto {}

export class PatchCollectionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;
}

export class ListCollectionsQueryDto extends ListQueryDto {
  /** `q` matches the collection name. */
}
