import request from 'supertest';
import { TEST_AUDIENCE, TEST_ISSUER, mintAlgNoneToken } from './support/jwks-server.js';
import { bearer, createTestContext, type TestContext } from './support/test-app.js';

/**
 * Claim under test: "every route requires a valid Auth0 access token."
 *
 * Each `it` below is one way that claim could be false. The happy path is the last two
 * lines of the file, not the first — a suite that leads with 200s tends to end with only 200s.
 */
describe('Authentication', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.close();
  });

  // Every route, not a sample. If a new controller is added without @Public(), it must
  // appear here or the coverage claim in the README is a lie.
  const PROTECTED_ROUTES: ReadonlyArray<[string, string]> = [
    ['get', '/me'],
    ['get', '/collections'],
    ['post', '/collections'],
    ['get', '/collections/some-id'],
    ['put', '/collections/some-id'],
    ['patch', '/collections/some-id'],
    ['delete', '/collections/some-id'],
    ['get', '/collections/some-id/bookmarks'],
    ['get', '/bookmarks'],
    ['post', '/bookmarks'],
    ['get', '/bookmarks/some-id'],
    ['put', '/bookmarks/some-id'],
    ['patch', '/bookmarks/some-id'],
    ['delete', '/bookmarks/some-id'],
    ['get', '/all'],
  ];

  const call = (method: string, url: string) =>
    (request(ctx.server) as unknown as Record<string, (u: string) => request.Test>)[method](url);

  describe('rejects unauthenticated access on EVERY route', () => {
    it.each(PROTECTED_ROUTES)('%s %s -> 401 with no Authorization header', async (m, url) => {
      await call(m, url).expect(401);
    });

    it.each(PROTECTED_ROUTES)('%s %s -> 401 with a malformed token', async (m, url) => {
      await call(m, url).set(bearer('this-is-not-a-jwt')).expect(401);
    });
  });

  it('rejects an EXPIRED token', async () => {
    const token = await ctx.mint(ctx.jwks.keys, {
      sub: ctx.alice.auth0Sub,
      expiresInSeconds: -60,
    });
    await request(ctx.server).get('/me').set(bearer(token)).expect(401);
  });

  it('rejects a token whose audience is NOT our API', async () => {
    // This is the check most often missed: the signature is genuine, the issuer is right,
    // it is unexpired — it is simply minted for a different API. Accepting it would mean
    // any token the tenant ever issued is a key to this API.
    const token = await ctx.mint(ctx.jwks.keys, {
      sub: ctx.alice.auth0Sub,
      audience: 'https://some-other-api.example.com',
    });
    await request(ctx.server).get('/me').set(bearer(token)).expect(401);
  });

  it('rejects an ID-token-shaped token (aud = client id, not the API)', async () => {
    // Concretely why the API takes the access token and not the ID token: an ID token is a
    // perfectly valid, correctly signed JWT from this very tenant. Only `aud` separates them.
    const token = await ctx.mint(ctx.jwks.keys, {
      sub: ctx.alice.auth0Sub,
      audience: 'H9F6QG5SzTKMv0tbmgxLj9LjG1EKVllA',
    });
    await request(ctx.server).get('/me').set(bearer(token)).expect(401);
  });

  it('rejects a token from a DIFFERENT issuer', async () => {
    const token = await ctx.mint(ctx.jwks.keys, {
      sub: ctx.alice.auth0Sub,
      issuer: 'https://evil-tenant.example.com/',
    });
    await request(ctx.server).get('/me').set(bearer(token)).expect(401);
  });

  it('rejects a token signed by a key that is not in the JWKS', async () => {
    // Right shape, right claims, wrong key. Catches a guard that decodes without verifying.
    const token = await ctx.mint(ctx.jwks.keys, {
      sub: ctx.alice.auth0Sub,
      useRogueKey: true,
    });
    await request(ctx.server).get('/me').set(bearer(token)).expect(401);
  });

  it('rejects a token with an unknown kid', async () => {
    const token = await ctx.mint(ctx.jwks.keys, {
      sub: ctx.alice.auth0Sub,
      kid: 'a-kid-that-does-not-exist',
    });
    await request(ctx.server).get('/me').set(bearer(token)).expect(401);
  });

  it('rejects an unsigned alg=none token', async () => {
    await request(ctx.server).get('/me').set(bearer(mintAlgNoneToken(ctx.alice.auth0Sub))).expect(401);
  });

  it.each([
    ['no scheme', 'just-a-token'],
    ['wrong scheme', 'Basic dXNlcjpwYXNz'],
    ['empty bearer', 'Bearer '],
    ['bearer with extra parts', 'Bearer a b'],
  ])('rejects a malformed Authorization header (%s)', async (_label, header) => {
    await request(ctx.server).get('/me').set('Authorization', header).expect(401);
  });

  it('accepts "bearer" in any case (RFC 7235 says the scheme is case-insensitive)', async () => {
    await request(ctx.server)
      .get('/me')
      .set('Authorization', `bEaReR ${ctx.alice.token}`)
      .expect(200);
  });

  it('does not tell the caller WHY a token was rejected', async () => {
    // "wrong audience" vs "expired" vs "bad signature" is free reconnaissance. All three
    // must be indistinguishable from outside.
    const expired = await ctx.mint(ctx.jwks.keys, { sub: 'auth0|alice', expiresInSeconds: -60 });
    const wrongAud = await ctx.mint(ctx.jwks.keys, { sub: 'auth0|alice', audience: 'https://x' });
    const forged = await ctx.mint(ctx.jwks.keys, { sub: 'auth0|alice', useRogueKey: true });

    const bodies = await Promise.all(
      [expired, wrongAud, forged].map(async (t) => {
        const res = await request(ctx.server).get('/me').set(bearer(t));
        return res.body.message;
      }),
    );
    expect(new Set(bodies).size).toBe(1);
  });

  it('/health is the only public route, and reveals nothing', async () => {
    const res = await request(ctx.server).get('/health').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('accepts a valid token and returns the identity from the token sub', async () => {
    const res = await request(ctx.server).get('/me').set(bearer(ctx.alice.token)).expect(200);
    expect(res.body).toMatchObject({ auth0Sub: ctx.alice.auth0Sub, email: ctx.alice.email });
  });

  it('creates a User row on first login for a sub it has never seen', async () => {
    const token = await ctx.mint(ctx.jwks.keys, {
      sub: 'auth0|brand-new-person',
      email: 'new@example.com',
    });
    const res = await request(ctx.server).get('/me').set(bearer(token)).expect(200);
    expect(res.body.auth0Sub).toBe('auth0|brand-new-person');

    const row = await ctx.prisma.user.findFirst({ where: { auth0Sub: 'auth0|brand-new-person' } });
    expect(row).not.toBeNull();
  });
});
