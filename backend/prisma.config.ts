import path from 'node:path';
import { defineConfig } from 'prisma/config';

// Prisma 7 config. DATABASE_URL is read here (not in schema.prisma) so migrations,
// seeding and the runtime client can each be pointed at a different database — which is
// what lets the test suite run against an isolated file per worker.
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? 'file:./prisma/dev.db',
  },
});
