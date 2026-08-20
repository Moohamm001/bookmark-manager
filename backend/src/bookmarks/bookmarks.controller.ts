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
import { BookmarksService } from './bookmarks.service.js';
import {
  CreateBookmarkDto,
  ListBookmarksQueryDto,
  PatchBookmarkDto,
  ReplaceBookmarkDto,
} from './dto/bookmark.dto.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';

@Controller('bookmarks')
export class BookmarksController {
  constructor(private readonly bookmarks: BookmarksService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListBookmarksQueryDto) {
    return this.bookmarks.list(user.id, query);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.bookmarks.findOne(user.id, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBookmarkDto) {
    return this.bookmarks.create(user.id, dto);
  }

  @Put(':id')
  replace(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReplaceBookmarkDto,
  ) {
    return this.bookmarks.replace(user.id, id, dto);
  }

  @Patch(':id')
  patch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: PatchBookmarkDto,
  ) {
    return this.bookmarks.patch(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    await this.bookmarks.remove(user.id, id);
  }
}
