import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { SignJWT, exportJWK, generateKeyPair, type CryptoKey } from 'jose';

/**
 * A local stand-in for the Auth0 JWKS endpoint.
 *
 * WHY THIS EXISTS — the brief's FAQ asks: "The test user is one account, is that a
 * problem?" It is, for the thing this app most needs to prove. Isolation tests require
 * tokens for TWO different subjects, and the tenant gives us one login. Options were:
 *
 *   (a) mock the guard out          -> tests the mock, not the auth. Rejected.
 *   (b) add a dev-only login bypass -> ships an auth bypass to production. Rejected.
 *   (c) mint real RS256 JWTs against a JWKS we control  <- chosen.
 *
 * (c) keeps the ENTIRE production validation path under test: the same
 * TokenVerifierService, the same `jose` verification, the same signature / iss / aud / exp
 * / alg checks, the same guard. The only substitution is which HTTPS host publishes the
 * public key. Nothing is stubbed, and the guard has no idea it is in a test.
 *
 * It also buys the negative cases the real tenant will not issue on demand: an expired
 * token, a wrong-audience token, one signed by a key that is not in the JWKS, and one that
 * nominates alg=none.
 *
 * The real tenant JWKS path is still exercised — see test/live-jwks.e2e-spec.ts.
 */

export const TEST_ISSUER = 'https://test-tenant.example.com/';
export const TEST_AUDIENCE = 'https://bbl-candidate-test-api';
const PUBLISHED_KID = 'test-key-1';

export interface TestKeys {
  /** Published in the JWKS. Tokens signed with this should verify. */
  publishedPrivateKey: CryptoKey;
  /** NOT published. Tokens signed with this must be rejected: valid JWT, unknown key. */
  roguePrivateKey: CryptoKey;
}

export interface JwksServerHandle {
  url: string;
  keys: TestKeys;
  close: () => Promise<void>;
}

export async function startJwksServer(): Promise<JwksServerHandle> {
  const published = await generateKeyPair('RS256', { extractable: true });
  const rogue = await generateKeyPair('RS256', { extractable: true });

  const publicJwk = await exportJWK(published.publicKey);
  const body = JSON.stringify({
    keys: [{ ...publicJwk, kid: PUBLISHED_KID, use: 'sig', alg: 'RS256' }],
  });

  const server: Server = createServer((req, res) => {
    if (req.url === '/.well-known/jwks.json') {
      res.writeHead(200, { 'content-type': 'application/json' }).end(body);
    } else {
      res.writeHead(404).end();
    }
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}/.well-known/jwks.json`,
    keys: { publishedPrivateKey: published.privateKey, roguePrivateKey: rogue.privateKey },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

export interface MintOptions {
  sub: string;
  email?: string;
  audience?: string | string[];
  issuer?: string;
  /** Seconds from now. Negative produces an already-expired token. */
  expiresInSeconds?: number;
  /** Sign with the unpublished key, to simulate a forged token. */
  useRogueKey?: boolean;
  kid?: string;
}

export async function mintToken(keys: TestKeys, opts: MintOptions): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = opts.expiresInSeconds ?? 3600;

  return new SignJWT({
    ...(opts.email ? { email: opts.email } : {}),
    scope: 'openid profile email',
  })
    .setProtectedHeader({ alg: 'RS256', kid: opts.kid ?? PUBLISHED_KID, typ: 'JWT' })
    .setSubject(opts.sub)
    .setIssuer(opts.issuer ?? TEST_ISSUER)
    .setAudience(opts.audience ?? TEST_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + expiresIn)
    .sign(opts.useRogueKey ? keys.roguePrivateKey : keys.publishedPrivateKey);
}

/**
 * An unsigned `alg: none` token. Constructed by hand because `jose` refuses to produce
 * one — which is itself the point: the library will not help you make this mistake, and we
 * assert that the guard will not accept it either.
 */
export function mintAlgNoneToken(sub: string): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const header = b64({ alg: 'none', typ: 'JWT' });
  const payload = b64({
    sub,
    iss: TEST_ISSUER,
    aud: TEST_AUDIENCE,
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  return `${header}.${payload}.`;
}
