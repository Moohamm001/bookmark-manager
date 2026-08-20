import request from 'supertest';
import { bearer, createTestContext, type TestContext } from './support/test-app.js';

/**
 * Claim under test — the one the whole app exists for:
 *
 *   "A user must not see, edit, or even learn of the EXISTENCE of another user's data."
 *
 * Alice and Bob each own a collection and two bookmarks. Every test below is Alice, with a
 * genuinely valid token, aiming a real request at a row of Bob's that really exists.
 *
 * The assertion is always 404 — never 403. A 403 would answer the question "does this id
 * exist?", which is the thing §3 forbids. The control test near the bottom pins that down:
 * Bob's real id and a fabricated id must produce identical responses.
 */
describe('Cross-user isolation', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.close();
  });

  describe('Alice cannot READ Bob rows', () => {
    it('GET /collections/:id of Bob -> 404', async () => {
      await request(ctx.server)
        .get(`/collections/${ctx.bob.collectionId}`)
        .set(bearer(ctx.alice.token))
        .expect(404);
    });

    it('GET /bookmarks/:id of Bob -> 404', async () => {
      await request(ctx.server)
        .get(`/bookmarks/${ctx.bob.bookmarkId}`)
        .set(bearer(ctx.alice.token))
        .expect(404);
    });

    it('GET /collections/:id/bookmarks of Bob collection -> 404, not an empty list', async () => {
      // An empty 200 would still confirm the collection exists. It must 404.
      await request(ctx.server)
        .get(`/collections/${ctx.bob.collectionId}/bookmarks`)
        .set(bearer(ctx.alice.token))
        .expect(404);
    });

    it('GET /bookmarks?collectionId=<Bob> -> 404, the filter is not an oracle', async () => {
      await request(ctx.server)
        .get(`/bookmarks?collectionId=${ctx.bob.collectionId}`)
        .set(bearer(ctx.alice.token))
        .expect(404);
    });
  });

  describe('Alice cannot WRITE to Bob rows', () => {
    it('PUT /collections/:id of Bob -> 404', async () => {
      await request(ctx.server)
        .put(`/collections/${ctx.bob.collectionId}`)
        .set(bearer(ctx.alice.token))
        .send({ name: 'pwned' })
        .expect(404);
    });

    it('PATCH /collections/:id of Bob -> 404', async () => {
      await request(ctx.server)
        .patch(`/collections/${ctx.bob.collectionId}`)
        .set(bearer(ctx.alice.token))
        .send({ name: 'pwned' })
        .expect(404);
    });

    it('DELETE /collections/:id of Bob -> 404', async () => {
      await request(ctx.server)
        .delete(`/collections/${ctx.bob.collectionId}`)
        .set(bearer(ctx.alice.token))
        .expect(404);
    });

    it('PUT /bookmarks/:id of Bob -> 404', async () => {
      await request(ctx.server)
        .put(`/bookmarks/${ctx.bob.bookmarkId}`)
        .set(bearer(ctx.alice.token))
        .send({ url: 'https://pwned.example.com', title: 'pwned' })
        .expect(404);
    });

    it('PATCH /bookmarks/:id of Bob -> 404', async () => {
      await request(ctx.server)
        .patch(`/bookmarks/${ctx.bob.bookmarkId}`)
        .set(bearer(ctx.alice.token))
        .send({ title: 'pwned' })
        .expect(404);
    });

    it('DELETE /bookmarks/:id of Bob -> 404', async () => {
      await request(ctx.server)
        .delete(`/bookmarks/${ctx.bob.bookmarkId}`)
        .set(bearer(ctx.alice.token))
        .expect(404);
    });

    it('none of the above actually mutated Bob rows', async () => {
      // 404 responses are not proof on their own; a handler could 404 *after* writing.
      const collection = await ctx.prisma.collection.findFirst({
        where: { id: ctx.bob.collectionId },
      });
      const bookmark = await ctx.prisma.bookmark.findFirst({ where: { id: ctx.bob.bookmarkId } });
      expect(collection).not.toBeNull();
      expect(collection?.name).toBe('Bob private');
      expect(collection?.ownerId).toBe(ctx.bob.id);
      expect(bookmark).not.toBeNull();
      expect(bookmark?.title).toBe('bob@example.com bookmark');
      expect(bookmark?.ownerId).toBe(ctx.bob.id);
    });
  });

  describe('list endpoints never leak another user rows', () => {
    it('GET /collections returns only Alice collections', async () => {
      const res = await request(ctx.server)
        .get('/collections?limit=100')
        .set(bearer(ctx.alice.token))
        .expect(200);

      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data.every((c: { ownerId: string }) => c.ownerId === ctx.alice.id)).toBe(true);
      expect(res.body.data.map((c: { id: string }) => c.id)).not.toContain(ctx.bob.collectionId);
    });

    it('GET /bookmarks returns only Alice bookmarks', async () => {
      const res = await request(ctx.server)
        .get('/bookmarks?limit=100')
        .set(bearer(ctx.alice.token))
        .expect(200);

      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data.every((b: { ownerId: string }) => b.ownerId === ctx.alice.id)).toBe(true);
      expect(res.body.data.map((b: { id: string }) => b.id)).not.toContain(ctx.bob.bookmarkId);
    });

    it('the total count is scoped to the caller, not global', async () => {
      // A correct `data` array with a global `total` still leaks how much other people have.
      const res = await request(ctx.server)
        .get('/bookmarks?limit=1')
        .set(bearer(ctx.alice.token))
        .expect(200);

      const aliceRows = await ctx.prisma.bookmark.count({ where: { ownerId: ctx.alice.id } });
      const allRows = await ctx.prisma.bookmark.count();
      expect(res.body.total).toBe(aliceRows);
      expect(allRows).toBeGreaterThan(aliceRows); // only meaningful if Bob has rows
    });

    it('search does not reach across owners', async () => {
      const res = await request(ctx.server)
        .get('/bookmarks?q=bob')
        .set(bearer(ctx.alice.token))
        .expect(200);
      expect(res.body.data).toHaveLength(0);
    });

    it('GET /all nests only the caller own bookmarks', async () => {
      const res = await request(ctx.server).get('/all').set(bearer(ctx.alice.token)).expect(200);
      const nested = res.body.collections.flatMap(
        (c: { bookmarks: { ownerId: string }[] }) => c.bookmarks,
      );
      expect(nested.every((b: { ownerId: string }) => b.ownerId === ctx.alice.id)).toBe(true);
      expect(
        res.body.uncategorised.every((b: { ownerId: string }) => b.ownerId === ctx.alice.id),
      ).toBe(true);
    });
  });

  describe('cross-tenant writes into another user container', () => {
    it('Alice cannot CREATE a bookmark inside Bob collection -> 404', async () => {
      // The subtle one. The bookmark would be owned by Alice, so every ownership check
      // passes — but it would appear inside Bob's collection.
      await request(ctx.server)
        .post('/bookmarks')
        .set(bearer(ctx.alice.token))
        .send({
          url: 'https://example.com/trojan',
          title: 'trojan',
          collectionId: ctx.bob.collectionId,
        })
        .expect(404);
    });

    it('Alice cannot MOVE her bookmark into Bob collection with PUT -> 404', async () => {
      await request(ctx.server)
        .put(`/bookmarks/${ctx.alice.bookmarkId}`)
        .set(bearer(ctx.alice.token))
        .send({
          url: 'https://example.com/moved',
          title: 'moved',
          collectionId: ctx.bob.collectionId,
        })
        .expect(404);
    });

    it('Alice cannot MOVE her bookmark into Bob collection with PATCH -> 404', async () => {
      await request(ctx.server)
        .patch(`/bookmarks/${ctx.alice.bookmarkId}`)
        .set(bearer(ctx.alice.token))
        .send({ collectionId: ctx.bob.collectionId })
        .expect(404);
    });

    it('Bob collection still contains exactly his own bookmarks', async () => {
      const inBobs = await ctx.prisma.bookmark.findMany({
        where: { collectionId: ctx.bob.collectionId },
      });
      expect(inBobs.length).toBeGreaterThan(0);
      expect(inBobs.every((b) => b.ownerId === ctx.bob.id)).toBe(true);
    });
  });

  describe('ownerId supplied by the client is never honoured', () => {
    it('POST /collections with an ownerId in the body is rejected, not silently applied', async () => {
      const res = await request(ctx.server)
        .post('/collections')
        .set(bearer(ctx.alice.token))
        .send({ name: 'planted', ownerId: ctx.bob.id });

      // ADR-005: we reject rather than strip, so a mass-assignment attempt is visible.
      expect(res.status).toBe(400);

      const planted = await ctx.prisma.collection.findFirst({ where: { name: 'planted' } });
      expect(planted).toBeNull();
    });

    it('POST /bookmarks with an ownerId in the body is rejected', async () => {
      const res = await request(ctx.server)
        .post('/bookmarks')
        .set(bearer(ctx.alice.token))
        .send({ url: 'https://example.com/x', title: 'x', ownerId: ctx.bob.id });
      expect(res.status).toBe(400);
    });

    it('a legitimate create is owned by the AUTHENTICATED user', async () => {
      const res = await request(ctx.server)
        .post('/collections')
        .set(bearer(ctx.alice.token))
        .send({ name: 'legit' })
        .expect(201);
      expect(res.body.ownerId).toBe(ctx.alice.id);
    });

    it('PUT cannot reassign ownership of a row you do own', async () => {
      const res = await request(ctx.server)
        .put(`/collections/${ctx.alice.collectionId}`)
        .set(bearer(ctx.alice.token))
        .send({ name: 'renamed', ownerId: ctx.bob.id });
      expect(res.status).toBe(400);

      const row = await ctx.prisma.collection.findFirst({ where: { id: ctx.alice.collectionId } });
      expect(row?.ownerId).toBe(ctx.alice.id);
    });
  });

  describe('another user id is indistinguishable from a nonexistent id', () => {
    it('the 404 body for a real foreign id equals the 404 body for a fabricated id', async () => {
      const real = await request(ctx.server)
        .get(`/collections/${ctx.bob.collectionId}`)
        .set(bearer(ctx.alice.token))
        .expect(404);
      const fake = await request(ctx.server)
        .get('/collections/definitely-not-a-real-id')
        .set(bearer(ctx.alice.token))
        .expect(404);

      const strip = (b: Record<string, unknown>) => ({
        ...b,
        path: undefined,
        timestamp: undefined,
      });
      expect(strip(real.body)).toEqual(strip(fake.body));
    });

    it('no route anywhere answers 403', async () => {
      // 403 means "it exists, but not for you" — the exact disclosure we are avoiding.
      const attempts = await Promise.all([
        request(ctx.server).get(`/collections/${ctx.bob.collectionId}`).set(bearer(ctx.alice.token)),
        request(ctx.server).get(`/bookmarks/${ctx.bob.bookmarkId}`).set(bearer(ctx.alice.token)),
        request(ctx.server).delete(`/bookmarks/${ctx.bob.bookmarkId}`).set(bearer(ctx.alice.token)),
        request(ctx.server)
          .patch(`/collections/${ctx.bob.collectionId}`)
          .set(bearer(ctx.alice.token))
          .send({ name: 'x' }),
      ]);
      expect(attempts.map((r) => r.status)).toEqual([404, 404, 404, 404]);
    });
  });

  describe('3.3 — sharing is NOT implemented, and that is asserted rather than assumed', () => {
    it('there is no route that grants another user access to a collection', async () => {
      // DECISIONS.md ADR-004 defers sharing. This test is what makes that a checkable
      // statement instead of a promise: if someone later adds a share endpoint without
      // revisiting the invariant, this fails and forces the conversation.
      const candidateRoutes = [
        `/collections/${ctx.alice.collectionId}/share`,
        `/collections/${ctx.alice.collectionId}/shares`,
        `/collections/${ctx.alice.collectionId}/grants`,
        '/shares',
      ];
      for (const route of candidateRoutes) {
        const res = await request(ctx.server)
          .post(route)
          .set(bearer(ctx.alice.token))
          .send({ email: ctx.bob.email });
        expect(res.status).toBe(404);
      }
    });

    it('isolation holds in the other direction too', async () => {
      const res = await request(ctx.server)
        .get('/collections?limit=100')
        .set(bearer(ctx.bob.token))
        .expect(200);
      expect(res.body.data.every((c: { ownerId: string }) => c.ownerId === ctx.bob.id)).toBe(true);
      expect(res.body.data.map((c: { id: string }) => c.id)).not.toContain(ctx.alice.collectionId);
    });
  });
});
