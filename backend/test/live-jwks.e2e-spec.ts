import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { bearer, TEMPLATE_DB, TMP_DIR } from './support/test-app.js';
import { mintToken, startJwksServer } from './support/jwks-server.js';

/**
 * The rest of the suite verifies our token handling against a JWKS we control. That is the
 * right trade — see the comment at the top of support/jwks-server.ts — but it leaves one
 * thing unproven: that the app, pointed at the REAL tenant, actually reaches it.
 *
 * This file closes that gap. It boots the app with the genuine Auth0 issuer, audience and
 * JWKS URI (no substitutions at all) and checks:
 *
 *   1. the tenant's JWKS is reachable and publishes RS256 signing keys;
 *   2. a token we minted ourselves is REJECTED against it. A guard that skipped signature
 *      verification, or that trusted a token's own `kid`, would let this through — and
 *      every other test in the suite would still pass.
 *
 * It needs network access, so it self-skips when the tenant is unreachable rather than
 * turning a flight-mode test run red. The skip is loud: it prints why.
 */
const AUTH0_ISSUER = 'https://dev-yg.us.auth0.com/';
const AUTH0_AUDIENCE = 'https://bbl-candidate-test-api';
const AUTH0_JWKS_URI = 'https://dev-yg.us.auth0.com/.well-known/jwks.json';

async function tenantReachable(): Promise<boolean> {
  try {
    const res = await fetch(AUTH0_JWKS_URI, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

describe('Live Auth0 JWKS path', () => {
  let app: INestApplication | undefined;
  let online = false;

  beforeAll(async () => {
    online = await tenantReachable();
    if (!online) {
      console.warn(`[live-jwks] SKIPPED: ${AUTH0_JWKS_URI} unreachable (offline or blocked).`);
      return;
    }

    mkdirSync(TMP_DIR, { recursive: true });
    const dbPath = path.join(TMP_DIR, `live-${randomUUID()}.db`);
    copyFileSync(TEMPLATE_DB, dbPath);

    process.env.DATABASE_URL = `file:${dbPath}`;
    process.env.AUTH0_ISSUER = AUTH0_ISSUER;
    process.env.AUTH0_AUDIENCE = AUTH0_AUDIENCE;
    process.env.AUTH0_JWKS_URI = AUTH0_JWKS_URI;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('the tenant publishes RS256 signing keys', async () => {
    if (!online) return;
    const jwks = (await (await fetch(AUTH0_JWKS_URI)).json()) as {
      keys: { kty: string; alg?: string; use?: string; kid: string }[];
    };
    expect(jwks.keys.length).toBeGreaterThan(0);
    expect(jwks.keys.every((k) => k.kty === 'RSA')).toBe(true);
    expect(jwks.keys.some((k) => k.alg === 'RS256')).toBe(true);
    // More than one key is why the verifier selects by kid and can refetch on rotation.
    expect(jwks.keys.every((k) => typeof k.kid === 'string' && k.kid.length > 0)).toBe(true);
  });

  it('a self-minted token is REJECTED against the real tenant keys', async () => {
    if (!online) return;
    const local = await startJwksServer();
    try {
      // Correct iss, correct aud, unexpired, well-formed RS256 — signed by a key the
      // tenant has never heard of. Only real signature verification catches this.
      const forged = await mintToken(local.keys, {
        sub: 'auth0|attacker',
        issuer: AUTH0_ISSUER,
        audience: AUTH0_AUDIENCE,
      });
      await request(app!.getHttpServer()).get('/me').set(bearer(forged)).expect(401);
    } finally {
      await local.close();
    }
  });

  it('still refuses an unauthenticated request when pointed at the real tenant', async () => {
    if (!online) return;
    await request(app!.getHttpServer()).get('/collections').expect(401);
  });
});
