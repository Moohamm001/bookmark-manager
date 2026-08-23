import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { BookmarksService } from '../bookmarks/bookmarks.service.js';
import { ListBookmarksQueryDto } from '../bookmarks/dto/bookmark.dto.js';
import { CollectionsService } from './collections.service.js';
import {
  CreateCollectionDto,
  ListCollectionsQueryDto,
  PatchCollectionDto,
  ReplaceCollectionDto,
} from './dto/collection.dto.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';

/** No handler contains an ownership `if` — the service does the scoping. */
@Controller('collections')
export class CollectionsController {
  constructor(
    private readonly collections: CollectionsService,
    private readonly bookmarks: BookmarksService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListCollectionsQueryDto) {
    return this.collections.list(user.id, query);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.collections.findOne(user.id, id);
  }

  @Get(':id/bookmarks')
  listBookmarks(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: ListBookmarksQueryDto,
  ) {
    return this.bookmarks.listByCollection(user.id, id, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCollectionDto) {
    return this.collections.create(user.id, dto);
  }

  @Put(':id')
  replace(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReplaceCollectionDto,
  ) {
    return this.collections.replace(user.id, id, dto);
  }

  @Patch(':id')
  patch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: PatchCollectionDto,
  ) {
    return this.collections.patch(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    await this.collections.remove(user.id, id);
  }
}
