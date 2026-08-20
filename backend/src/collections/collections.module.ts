import { Module, forwardRef } from '@nestjs/common';
import { BookmarksModule } from '../bookmarks/bookmarks.module.js';
import { CollectionsController } from './collections.controller.js';
import { CollectionsService } from './collections.service.js';

@Module({
  imports: [forwardRef(() => BookmarksModule)],
  controllers: [CollectionsController],
  providers: [CollectionsService],
  exports: [CollectionsService],
})
export class CollectionsModule {}
