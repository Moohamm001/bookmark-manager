import { Module, forwardRef } from '@nestjs/common';
import { CollectionsModule } from '../collections/collections.module.js';
import { AllController } from './all.controller.js';
import { BookmarksController } from './bookmarks.controller.js';
import { BookmarksService } from './bookmarks.service.js';

@Module({
  imports: [forwardRef(() => CollectionsModule)],
  controllers: [BookmarksController, AllController],
  providers: [BookmarksService],
  exports: [BookmarksService],
})
export class BookmarksModule {}
