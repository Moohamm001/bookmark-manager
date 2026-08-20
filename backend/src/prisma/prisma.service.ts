import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * The single Prisma client for the app.
 *
 * The connection URL is read from the environment at construction rather than baked into
 * the schema, which is what lets the e2e suite point each Jest worker at its own SQLite
 * file without touching application code.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const url = process.env.DATABASE_URL ?? 'file:./dev.db';
    super({ adapter: new PrismaBetterSqlite3({ url }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
