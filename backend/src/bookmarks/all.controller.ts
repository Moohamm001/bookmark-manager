import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { BookmarksService } from './bookmarks.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';

/** Backs the bonus /all page: collections with their bookmarks nested. */
@Controller('all')
export class AllController {
  constructor(private readonly bookmarks: BookmarksService) {}

  @Get()
  all(@CurrentUser() user: AuthenticatedUser) {
    return this.bookmarks.listAllGrouped(user.id);
  }
}
