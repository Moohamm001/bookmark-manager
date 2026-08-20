import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import {
  TEST_AUDIENCE,
  TEST_ISSUER,
  mintToken,
  startJwksServer,
  type JwksServerHandle,
} from './jwks-server.js';

export const TMP_DIR = path.join(__dirname, '..', '.tmp');
export const TEMPLATE_DB = path.join(TMP_DIR, 'template.db');

export interface SeededUser {
  id: string;
  auth0Sub: string;
  email: string;
  token: string;
  collectionId: string;
  bookmarkId: string;
  uncategorisedBookmarkId: string;
}

export interface TestContext {
  app: INestApplication;
  /** Typed so supertest accepts it and `npm run lint:types` covers the tests too. */
  server: Server;
  prisma: PrismaService;
  jwks: JwksServerHandle;
  alice: SeededUser;
  bob: SeededUser;
  /** Mint an arbitrary token against the test JWKS, for negative cases. */
  mint: typeof mintToken;
  close: () => Promise<void>;
}

/**
 * Builds the REAL application — same AppModule, same configureApp(), same global guard and
 * validation pipe as main.ts. Only two things differ from production, and both are
 * environment, not code: the database file and which host serves the JWKS.
 *
 * Each context gets its own SQLite file, copied from a migrated template created in
 * globalSetup. Copying a file is far faster than running migrations per suite, and it
 * guarantees suites cannot see each other's rows.
 */
export async function createTestContext(): Promise<TestContext> {
  const jwks = await startJwksServer();

  mkdirSync(TMP_DIR, { recursive: true });
  const dbPath = path.join(TMP_DIR, `test-${randomUUID()}.db`);
  copyFileSync(TEMPLATE_DB, dbPath);

  process.env.DATABASE_URL = `file:${dbPath}`;
  process.env.AUTH0_ISSUER = TEST_ISSUER;
  process.env.AUTH0_AUDIENCE = TEST_AUDIENCE;
  process.env.AUTH0_JWKS_URI = jwks.url;

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();

  const prisma = app.get(PrismaService);

  const alice = await seedUser(prisma, jwks, 'auth0|alice', 'alice@example.com', 'Alice reading');
  const bob = await seedUser(prisma, jwks, 'auth0|bob', 'bob@example.com', 'Bob private');

  return {
    app,
    server: app.getHttpServer() as Server,
    prisma,
    jwks,
    alice,
    bob,
    mint: mintToken,
    close: async () => {
      await app.close();
      await jwks.close();
      try {
        rmSync(dbPath, { force: true });
      } catch {
        /* windows may still hold the handle; the tmp dir is wiped by globalSetup */
      }
    },
  };
}

async function seedUser(
  prisma: PrismaService,
  jwks: JwksServerHandle,
  auth0Sub: string,
  email: string,
  collectionName: string,
): Promise<SeededUser> {
  const user = await prisma.user.create({ data: { auth0Sub, email } });
  const collection = await prisma.collection.create({
    data: { name: collectionName, ownerId: user.id },
  });
  const bookmark = await prisma.bookmark.create({
    data: {
      url: `https://example.com/${auth0Sub}/1`,
      title: `${email} bookmark`,
      notes: 'private',
      ownerId: user.id,
      collectionId: collection.id,
    },
  });
  const uncategorised = await prisma.bookmark.create({
    data: {
      url: `https://example.com/${auth0Sub}/loose`,
      title: `${email} uncategorised`,
      ownerId: user.id,
      collectionId: null,
    },
  });

  return {
    id: user.id,
    auth0Sub,
    email,
    token: await mintToken(jwks.keys, { sub: auth0Sub, email }),
    collectionId: collection.id,
    bookmarkId: bookmark.id,
    uncategorisedBookmarkId: uncategorised.id,
  };
}

/** `Authorization` header helper. */
export const bearer = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
});
