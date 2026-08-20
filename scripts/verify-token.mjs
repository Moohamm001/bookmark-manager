#!/usr/bin/env node
/**
 * Phase 0, step 3-4: get REAL tokens from the tenant and inspect them.
 *
 *   node scripts/verify-token.mjs            # with audience  -> expect a JWT access token
 *   node scripts/verify-token.mjs --no-audience   # without    -> expect an OPAQUE access token
 *
 * Runs a genuine Authorization Code + PKCE (S256) flow: it starts a throwaway listener on
 * http://localhost:3000/callback, prints an /authorize URL for you to open, and exchanges the
 * code it catches. Your password is typed into Auth0's own login page - never into this script.
 *
 * No dependencies. Node 18+.
 */
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';

const ISSUER = 'https://dev-yg.us.auth0.com';
const CLIENT_ID = 'H9F6QG5SzTKMv0tbmgxLj9LjG1EKVllA';
const REDIRECT_URI = 'http://localhost:3000/callback';
const AUDIENCE = 'https://bbl-candidate-test-api';

const withAudience = !process.argv.includes('--no-audience');
const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

const verifier = b64url(randomBytes(32));
const challenge = b64url(createHash('sha256').update(verifier).digest());
const state = b64url(randomBytes(16));

const params = new URLSearchParams({
  response_type: 'code',
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT_URI,
  scope: 'openid profile email',
  state,
  code_challenge: challenge,
  code_challenge_method: 'S256',
});
if (withAudience) params.set('audience', AUDIENCE);

console.log(`\n=== PKCE (S256) ${withAudience ? 'WITH' : 'WITHOUT'} audience ===`);
console.log(`code_verifier  : ${verifier}`);
console.log(`code_challenge : ${challenge}   (S256 of the verifier)`);
console.log(`\nOpen this URL and sign in as candidate@test.com:\n\n${ISSUER}/authorize?${params}\n`);

const code = await new Promise((resolve, reject) => {
  const server = createServer((req, res) => {
    const url = new URL(req.url, REDIRECT_URI);
    if (url.pathname !== '/callback') { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': 'text/html' }).end('<h1>Done - back to the terminal.</h1>');
    server.close();
    if (url.searchParams.get('error')) return reject(new Error(url.searchParams.get('error_description')));
    if (url.searchParams.get('state') !== state) return reject(new Error('state mismatch - possible CSRF'));
    resolve(url.searchParams.get('code'));
  }).listen(3000, () => console.log('Listening on http://localhost:3000/callback ...'));
  setTimeout(() => { server.close(); reject(new Error('timed out after 5 min')); }, 300_000);
});

console.log(`\nGot authorization code: ${code.slice(0, 12)}...`);

const res = await fetch(`${ISSUER}/oauth/token`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  }),
});
const tokens = await res.json();
if (!res.ok) { console.error('Token exchange failed:', tokens); process.exit(1); }

const decode = (jwt) => {
  const parts = jwt.split('.');
  if (parts.length !== 3) return null;
  try {
    return {
      header: JSON.parse(Buffer.from(parts[0], 'base64url')),
      payload: JSON.parse(Buffer.from(parts[1], 'base64url')),
    };
  } catch { return null; }
};

const at = tokens.access_token;
const decoded = decode(at);

console.log(`\n--- access_token (${at.length} chars) ---`);
if (!decoded) {
  console.log('NOT a JWT -> OPAQUE token. Our API cannot validate this offline;');
  console.log('it would have to call /userinfo on every request. This is exactly why we');
  console.log('request the API audience at login.');
  console.log(`value: ${at.slice(0, 24)}...`);
} else {
  console.log('It IS a JWT.');
  console.log('header :', JSON.stringify(decoded.header));
  const p = decoded.payload;
  console.log('iss    :', p.iss);
  console.log('aud    :', JSON.stringify(p.aud));
  console.log('sub    :', p.sub);
  console.log('exp    :', p.exp, `(${new Date(p.exp * 1000).toISOString()})`);
  console.log('scope  :', p.scope);
  console.log('\n>> aud names OUR API. alg is RS256 with a kid from the tenant JWKS.');
}

if (tokens.id_token) {
  const id = decode(tokens.id_token);
  console.log(`\n--- id_token ---`);
  console.log('header :', JSON.stringify(id.header));
  console.log('aud    :', JSON.stringify(id.payload.aud), '  <-- the CLIENT ID, not our API');
  console.log('sub    :', id.payload.sub, ' email:', id.payload.email);
  console.log('\n>> Same sub, different aud. Accepting this at the API would be audience confusion.');
}
