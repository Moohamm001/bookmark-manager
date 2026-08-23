import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ListQueryDto } from '../../common/dto/list-query.dto.js';

export class CreateCollectionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;
}

/** PUT requires the full body; PATCH does not. Separate classes on purpose. */
export class ReplaceCollectionDto extends CreateCollectionDto {}

export class PatchCollectionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;
}

export class ListCollectionsQueryDto extends ListQueryDto {}
