import request from 'supertest';
import { bearer, createTestContext, type TestContext } from './support/test-app.js';

/**
 * Regression test for the first-login race.
 *
 * The frontend fires its list requests from a useEffect, and React StrictMode
 * double-invokes effects in development — so the very first page load after a brand-new
 * user signs in sends TWO concurrent requests carrying a `sub` that has no User row yet.
 * Both hit AuthGuard, both call resolveFromToken, and both try to create the same
 * auth0Sub. `auth0Sub` is UNIQUE, so the loser of that race hits a unique-constraint
 * violation and the request fails.
 *
 * It only ever reproduces on the first request(s) for a given sub, which is exactly the
 * moment a reviewer signs in for the first time.
 */
describe('First-login concurrency', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('handles concurrent first requests from a brand-new user', async () => {
    const token = await ctx.mint(ctx.jwks.keys, {
      sub: 'auth0|first-timer',
      email: 'first@example.com',
    });

    const responses = await Promise.all([
      request(ctx.server).get('/collections').set(bearer(token)),
      request(ctx.server).get('/bookmarks').set(bearer(token)),
      request(ctx.server).get('/me').set(bearer(token)),
      request(ctx.server).get('/all').set(bearer(token)),
    ]);

    expect(responses.map((r) => r.status)).toEqual([200, 200, 200, 200]);

    // And exactly one User row was created, not several.
    const users = await ctx.prisma.user.findMany({ where: { auth0Sub: 'auth0|first-timer' } });
    expect(users).toHaveLength(1);
  });
});
