import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth/auth.guard.js';
import { AuthModule } from './auth/auth.module.js';
import { BookmarksModule } from './bookmarks/bookmarks.module.js';
import { CollectionsModule } from './collections/collections.module.js';
import { HealthController } from './health.controller.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { MeController } from './users/me.controller.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    CollectionsModule,
    BookmarksModule,
  ],
  controllers: [HealthController, MeController],
  providers: [
    {
      // GLOBAL. Every route is protected unless it carries @Public(). Registering the
      // guard here rather than on each controller is the difference between "we remembered
      // to protect all seven controllers" and "it is not possible to forget".
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
})
export class AppModule {}
