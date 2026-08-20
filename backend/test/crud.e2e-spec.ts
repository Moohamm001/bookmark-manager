import request from 'supertest';
import { bearer, createTestContext, type TestContext } from './support/test-app.js';

/**
 * Contract tests: the verbs behave the way API_DESIGN.md says they do.
 *
 * These are not "the happy path" for its own sake — each one pins a distinction that is
 * easy to get wrong and that no security test would catch: PUT vs PATCH semantics, the
 * nullable relation, validation at the write boundary.
 */
describe('Collections and bookmarks contract', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.close();
  });

  const auth = () => bearer(ctx.alice.token);

  describe('collections', () => {
    it('POST creates and returns 201 with the row', async () => {
      const res = await request(ctx.server)
        .post('/collections')
        .set(auth())
        .send({ name: 'Recipes' })
        .expect(201);
      expect(res.body).toMatchObject({ name: 'Recipes', ownerId: ctx.alice.id });
      expect(res.body.id).toEqual(expect.any(String));
      expect(res.body.createdAt).toEqual(expect.any(String));
    });

    it('POST rejects an empty name with 400', async () => {
      await request(ctx.server).post('/collections').set(auth()).send({ name: '' }).expect(400);
    });

    it('POST rejects a missing name with 400', async () => {
      await request(ctx.server).post('/collections').set(auth()).send({}).expect(400);
    });

    it('GET list is paginated and reports a total', async () => {
      const res = await request(ctx.server).get('/collections?limit=1').set(auth()).expect(200);
      expect(res.body).toMatchObject({ limit: 1, offset: 0 });
      expect(res.body.data).toHaveLength(1);
      expect(res.body.total).toBeGreaterThan(1);
    });

    it('GET list rejects an out-of-range limit with 400', async () => {
      await request(ctx.server).get('/collections?limit=5000').set(auth()).expect(400);
    });

    it('GET list filters by q on the name', async () => {
      await request(ctx.server).post('/collections').set(auth()).send({ name: 'Woodworking' });
      const res = await request(ctx.server).get('/collections?q=woodwork').set(auth()).expect(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Woodworking');
    });

    it('PUT replaces and returns the updated row', async () => {
      const created = await request(ctx.server)
        .post('/collections')
        .set(auth())
        .send({ name: 'before' });
      const res = await request(ctx.server)
        .put(`/collections/${created.body.id}`)
        .set(auth())
        .send({ name: 'after' })
        .expect(200);
      expect(res.body.name).toBe('after');
    });

    it('PUT requires the FULL body — a missing name is 400, not a partial update', async () => {
      const created = await request(ctx.server)
        .post('/collections')
        .set(auth())
        .send({ name: 'keep me' });
      await request(ctx.server).put(`/collections/${created.body.id}`).set(auth()).send({}).expect(400);

      const row = await ctx.prisma.collection.findFirst({ where: { id: created.body.id } });
      expect(row?.name).toBe('keep me');
    });

    it('PATCH accepts a partial body', async () => {
      const created = await request(ctx.server)
        .post('/collections')
        .set(auth())
        .send({ name: 'patch me' });
      const res = await request(ctx.server)
        .patch(`/collections/${created.body.id}`)
        .set(auth())
        .send({ name: 'patched' })
        .expect(200);
      expect(res.body.name).toBe('patched');
    });

    it('DELETE returns 204 and the row is gone', async () => {
      const created = await request(ctx.server)
        .post('/collections')
        .set(auth())
        .send({ name: 'temp' });
      await request(ctx.server).delete(`/collections/${created.body.id}`).set(auth()).expect(204);
      await request(ctx.server).get(`/collections/${created.body.id}`).set(auth()).expect(404);
    });

    it('DELETE of an already-deleted id is 404, not 500', async () => {
      const created = await request(ctx.server)
        .post('/collections')
        .set(auth())
        .send({ name: 'twice' });
      await request(ctx.server).delete(`/collections/${created.body.id}`).set(auth()).expect(204);
      await request(ctx.server).delete(`/collections/${created.body.id}`).set(auth()).expect(404);
    });
  });

  describe('bookmarks', () => {
    it('POST creates an uncategorised bookmark when collectionId is omitted', async () => {
      const res = await request(ctx.server)
        .post('/bookmarks')
        .set(auth())
        .send({ url: 'https://example.com/loose', title: 'Loose' })
        .expect(201);
      expect(res.body.collectionId).toBeNull();
      expect(res.body.notes).toBeNull();
      expect(res.body.ownerId).toBe(ctx.alice.id);
    });

    it('POST files a bookmark into a collection the caller owns', async () => {
      const res = await request(ctx.server)
        .post('/bookmarks')
        .set(auth())
        .send({
          url: 'https://example.com/filed',
          title: 'Filed',
          collectionId: ctx.alice.collectionId,
        })
        .expect(201);
      expect(res.body.collectionId).toBe(ctx.alice.collectionId);
    });

    it('POST 404s when collectionId does not exist at all', async () => {
      await request(ctx.server)
        .post('/bookmarks')
        .set(auth())
        .send({ url: 'https://example.com/x', title: 'x', collectionId: 'no-such-collection' })
        .expect(404);
    });

    it.each([
      ['javascript: URL', 'javascript:alert(document.cookie)'],
      ['data: URL', 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='],
      ['no protocol', 'example.com'],
      ['file: URL', 'file:///etc/passwd'],
    ])('POST rejects a %s with 400', async (_label, url) => {
      // These end up as anchor hrefs in the frontend. Rejecting at the write boundary means
      // the frontend is not the only thing standing between stored data and script execution.
      await request(ctx.server).post('/bookmarks').set(auth()).send({ url, title: 'x' }).expect(400);
    });

    it('POST accepts an http localhost URL', async () => {
      await request(ctx.server)
        .post('/bookmarks')
        .set(auth())
        .send({ url: 'http://localhost:3000/callback', title: 'local' })
        .expect(201);
    });

    it('PUT is a genuine full replace: omitted notes becomes null', async () => {
      const created = await request(ctx.server)
        .post('/bookmarks')
        .set(auth())
        .send({ url: 'https://example.com/a', title: 'A', notes: 'has notes' })
        .expect(201);
      expect(created.body.notes).toBe('has notes');

      const res = await request(ctx.server)
        .put(`/bookmarks/${created.body.id}`)
        .set(auth())
        .send({ url: 'https://example.com/b', title: 'B' })
        .expect(200);

      expect(res.body.title).toBe('B');
      expect(res.body.notes).toBeNull(); // replaced, not merged
    });

    it('PUT requires url and title — a partial body is 400', async () => {
      await request(ctx.server)
        .put(`/bookmarks/${ctx.alice.bookmarkId}`)
        .set(auth())
        .send({ title: 'only title' })
        .expect(400);
    });

    it('PATCH leaves omitted fields untouched', async () => {
      const created = await request(ctx.server)
        .post('/bookmarks')
        .set(auth())
        .send({ url: 'https://example.com/p', title: 'P', notes: 'keep' })
        .expect(201);

      const res = await request(ctx.server)
        .patch(`/bookmarks/${created.body.id}`)
        .set(auth())
        .send({ title: 'P2' })
        .expect(200);

      expect(res.body.title).toBe('P2');
      expect(res.body.notes).toBe('keep'); // merged, not replaced
      expect(res.body.url).toBe('https://example.com/p');
    });

    it('PATCH collectionId: null uncategorises a bookmark', async () => {
      const created = await request(ctx.server)
        .post('/bookmarks')
        .set(auth())
        .send({
          url: 'https://example.com/move',
          title: 'Move',
          collectionId: ctx.alice.collectionId,
        })
        .expect(201);

      const res = await request(ctx.server)
        .patch(`/bookmarks/${created.body.id}`)
        .set(auth())
        .send({ collectionId: null })
        .expect(200);
      expect(res.body.collectionId).toBeNull();
    });

    it('filters by collectionId', async () => {
      const res = await request(ctx.server)
        .get(`/bookmarks?collectionId=${ctx.alice.collectionId}&limit=100`)
        .set(auth())
        .expect(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(
        res.body.data.every((b: { collectionId: string }) => b.collectionId === ctx.alice.collectionId),
      ).toBe(true);
    });

    it('filters to uncategorised only', async () => {
      const res = await request(ctx.server)
        .get('/bookmarks?uncategorised=true&limit=100')
        .set(auth())
        .expect(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data.every((b: { collectionId: null }) => b.collectionId === null)).toBe(true);
    });

    it('full-text q searches title, notes and url', async () => {
      await request(ctx.server)
        .post('/bookmarks')
        .set(auth())
        .send({ url: 'https://example.com/zzz', title: 'Findable', notes: 'needle here' })
        .expect(201);

      const byTitle = await request(ctx.server).get('/bookmarks?q=Findable').set(auth()).expect(200);
      const byNotes = await request(ctx.server).get('/bookmarks?q=needle').set(auth()).expect(200);
      expect(byTitle.body.total).toBe(1);
      expect(byNotes.body.total).toBe(1);
    });

    it('GET /collections/:id/bookmarks returns only that collection', async () => {
      const res = await request(ctx.server)
        .get(`/collections/${ctx.alice.collectionId}/bookmarks?limit=100`)
        .set(auth())
        .expect(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(
        res.body.data.every((b: { collectionId: string }) => b.collectionId === ctx.alice.collectionId),
      ).toBe(true);
    });

    it('returns a consistent error shape on every failure', async () => {
      const notFound = await request(ctx.server).get('/bookmarks/nope').set(auth()).expect(404);
      const badRequest = await request(ctx.server)
        .post('/bookmarks')
        .set(auth())
        .send({ title: 'no url' })
        .expect(400);
      const unauthorised = await request(ctx.server).get('/bookmarks').expect(401);

      for (const res of [notFound, badRequest, unauthorised]) {
        expect(Object.keys(res.body).sort()).toEqual([
          'error',
          'message',
          'path',
          'statusCode',
          'timestamp',
        ]);
      }
    });
  });
});
