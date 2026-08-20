import request from 'supertest';
import { bearer, createTestContext, type TestContext } from './support/test-app.js';

/**
 * Claim under test: "deleting a collection does not delete its bookmarks; they become
 * uncategorised." (DECISIONS.md ADR-003, `onDelete: SetNull` in schema.prisma.)
 *
 * This is the decision most likely to be silently reversed by a later schema edit — the
 * Prisma default for an optional relation is SetNull, so it would keep working, but
 * someone switching the relation to required, or hand-writing a migration, would flip it
 * to Cascade and destroy data. Asserting the resulting ROWS, not just the status code, is
 * what makes that a caught regression rather than a support ticket.
 */
describe('Collection delete behaviour (ADR-003: SetNull)', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.close();
  });

  const auth = () => bearer(ctx.alice.token);

  it('deleting a collection leaves its bookmarks alive and uncategorised', async () => {
    const collection = await request(ctx.server)
      .post('/collections')
      .set(auth())
      .send({ name: 'Doomed' })
      .expect(201);

    const first = await request(ctx.server)
      .post('/bookmarks')
      .set(auth())
      .send({ url: 'https://example.com/1', title: 'Survivor 1', collectionId: collection.body.id })
      .expect(201);
    const second = await request(ctx.server)
      .post('/bookmarks')
      .set(auth())
      .send({ url: 'https://example.com/2', title: 'Survivor 2', collectionId: collection.body.id })
      .expect(201);

    await request(ctx.server).delete(`/collections/${collection.body.id}`).set(auth()).expect(204);

    // Straight at the database: the bookmarks still exist...
    const rows = await ctx.prisma.bookmark.findMany({
      where: { id: { in: [first.body.id, second.body.id] } },
    });
    expect(rows).toHaveLength(2);

    // ...their collectionId is now null...
    expect(rows.every((r) => r.collectionId === null)).toBe(true);

    // ...and they still belong to Alice. SetNull must not have touched ownership.
    expect(rows.every((r) => r.ownerId === ctx.alice.id)).toBe(true);
  });

  it('the survivors are reachable through the API as uncategorised', async () => {
    const collection = await request(ctx.server)
      .post('/collections')
      .set(auth())
      .send({ name: 'Doomed 2' })
      .expect(201);
    const bookmark = await request(ctx.server)
      .post('/bookmarks')
      .set(auth())
      .send({ url: 'https://example.com/3', title: 'Survivor 3', collectionId: collection.body.id })
      .expect(201);

    await request(ctx.server).delete(`/collections/${collection.body.id}`).set(auth()).expect(204);

    const res = await request(ctx.server)
      .get(`/bookmarks/${bookmark.body.id}`)
      .set(auth())
      .expect(200);
    expect(res.body.collectionId).toBeNull();

    const uncategorised = await request(ctx.server)
      .get('/bookmarks?uncategorised=true&limit=100')
      .set(auth())
      .expect(200);
    expect(uncategorised.body.data.map((b: { id: string }) => b.id)).toContain(bookmark.body.id);
  });

  it('the constraint is enforced by the DATABASE, not just by application code', async () => {
    // Deleting straight through Prisma bypasses every service, controller and guard. If
    // SetNull lived in application code rather than in the migration, this would either
    // fail on a foreign-key violation or orphan a dangling collectionId.
    const collection = await ctx.prisma.collection.create({
      data: { name: 'DB-level', ownerId: ctx.alice.id },
    });
    const bookmark = await ctx.prisma.bookmark.create({
      data: {
        url: 'https://example.com/db',
        title: 'DB survivor',
        ownerId: ctx.alice.id,
        collectionId: collection.id,
      },
    });

    await ctx.prisma.collection.delete({ where: { id: collection.id } });

    const after = await ctx.prisma.bookmark.findFirst({ where: { id: bookmark.id } });
    expect(after).not.toBeNull();
    expect(after?.collectionId).toBeNull();
  });

  it('deleting a USER does cascade — their rows go with them', async () => {
    // The contrast that makes ADR-003 a decision rather than an accident: content is
    // cascaded from its owner, but not from its folder.
    const doomed = await ctx.prisma.user.create({
      data: { auth0Sub: 'auth0|doomed', email: 'doomed@example.com' },
    });
    const collection = await ctx.prisma.collection.create({
      data: { name: 'theirs', ownerId: doomed.id },
    });
    await ctx.prisma.bookmark.create({
      data: { url: 'https://example.com/d', title: 'theirs', ownerId: doomed.id },
    });

    await ctx.prisma.user.delete({ where: { id: doomed.id } });

    expect(await ctx.prisma.collection.findFirst({ where: { id: collection.id } })).toBeNull();
    expect(await ctx.prisma.bookmark.count({ where: { ownerId: doomed.id } })).toBe(0);
  });
});
