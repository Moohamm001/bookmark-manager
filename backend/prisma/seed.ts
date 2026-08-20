/**
 * Seed: TWO distinct users whose data does not overlap.
 *
 * The overlap matters. Every isolation test asserts "A cannot reach B's row", which is
 * only meaningful if B actually has rows for A to fail to reach. Seeding one user, or two
 * users sharing a collection, would make those tests pass vacuously.
 *
 * The `auth0Sub` values are placeholders. The real Auth0 test user
 * (candidate@test.com) is created on first login by AuthGuard's create-on-first-login
 * path — see DECISIONS.md (ADR-006) for why one real account is enough.
 */
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '../src/generated/prisma/client.js';

const url = process.env.DATABASE_URL ?? 'file:./dev.db';
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });

export const SEED = {
  alice: { auth0Sub: 'auth0|seed-alice', email: 'alice@example.com' },
  bob: { auth0Sub: 'auth0|seed-bob', email: 'bob@example.com' },
} as const;

async function main(): Promise<void> {
  // Order matters: bookmarks reference collections reference users.
  await prisma.bookmark.deleteMany();
  await prisma.collection.deleteMany();
  await prisma.user.deleteMany();

  const alice = await prisma.user.create({ data: SEED.alice });
  const bob = await prisma.user.create({ data: SEED.bob });

  const aliceReading = await prisma.collection.create({
    data: { name: 'Reading list', ownerId: alice.id },
  });
  const aliceWork = await prisma.collection.create({
    data: { name: 'Work', ownerId: alice.id },
  });
  const bobPrivate = await prisma.collection.create({
    data: { name: "Bob's private research", ownerId: bob.id },
  });

  await prisma.bookmark.createMany({
    data: [
      {
        url: 'https://nestjs.com/',
        title: 'NestJS docs',
        notes: 'Guards and the request lifecycle',
        ownerId: alice.id,
        collectionId: aliceWork.id,
      },
      {
        url: 'https://www.prisma.io/docs',
        title: 'Prisma docs',
        notes: 'Driver adapters, referential actions',
        ownerId: alice.id,
        collectionId: aliceWork.id,
      },
      {
        url: 'https://datatracker.ietf.org/doc/html/rfc7636',
        title: 'RFC 7636 — PKCE',
        notes: 'S256 vs plain',
        ownerId: alice.id,
        collectionId: aliceReading.id,
      },
      // Uncategorised on purpose: proves collectionId is genuinely nullable and that an
      // ownerless-by-collection bookmark still has a direct owner.
      {
        url: 'https://jwt.io/',
        title: 'jwt.io',
        notes: null,
        ownerId: alice.id,
        collectionId: null,
      },
      // Bob's rows. No test should ever see these through Alice's token.
      {
        url: 'https://example.com/bob-secret-1',
        title: "Bob's confidential bookmark",
        notes: 'If Alice can read this, the app is broken.',
        ownerId: bob.id,
        collectionId: bobPrivate.id,
      },
      {
        url: 'https://example.com/bob-secret-2',
        title: "Bob's uncategorised note",
        notes: null,
        ownerId: bob.id,
        collectionId: null,
      },
    ],
  });

  const counts = {
    users: await prisma.user.count(),
    collections: await prisma.collection.count(),
    bookmarks: await prisma.bookmark.count(),
  };
  console.log('Seeded:', counts);
  console.log(`  alice (${alice.id}) — 2 collections, 4 bookmarks (1 uncategorised)`);
  console.log(`  bob   (${bob.id}) — 1 collection, 2 bookmarks (1 uncategorised)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
