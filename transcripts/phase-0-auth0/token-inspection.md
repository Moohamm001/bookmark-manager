# Phase 0, steps 3–4 — real tokens, inspected by hand

Steps 1–2 (discovery document, JWKS) and the credential-free `/authorize` probes are in
[`FINDINGS.md`](FINDINGS.md). This is the step that needed a password, so it was run by hand
with `scripts/verify-token.mjs` — a genuine Authorization Code + PKCE (S256) flow, hand-rolled
with `node:crypto`, no dependencies.

Date: 2026-08-23. Signed in through the tenant's Google connection rather than
`candidate@test.com`; the flow and the token shape are identical either way.

**Redacted:** the `sub` and `email` below identify a real person and this repository is
public. Everything security-relevant — `alg`, `kid`, `iss`, `aud`, `exp` — is verbatim.

---

## With `audience=https://bbl-candidate-test-api`

```
$ node scripts/verify-token.mjs

=== PKCE (S256) WITH audience ===
code_verifier  : 6nDFcmO4t0IF_6HYV7_k0_RSq-SERANJo28csaneMqg
code_challenge : 5gMj7MEc_iCY-ILfRho96YqJ-1rFZh1TjlgYsQL1CbY   (S256 of the verifier)

Listening on http://localhost:3000/callback ...
Got authorization code: hZYi-AndyoxE...

--- access_token (778 chars) ---
It IS a JWT.
header : {"alg":"RS256","typ":"JWT","kid":"tOu0FHcN3C2etrel4Qhaz"}
iss    : https://dev-yg.us.auth0.com/
aud    : ["https://bbl-candidate-test-api","https://dev-yg.us.auth0.com/userinfo"]
sub    : google-oauth2|1173............417
exp    : 1787498134 (2026-08-23T15:15:34.000Z)
scope  : openid profile email

--- id_token ---
header : {"alg":"RS256","typ":"JWT","kid":"tOu0FHcN3C2etrel4Qhaz"}
aud    : "H9F6QG5SzTKMv0tbmgxLj9LjG1EKVllA"   <-- the CLIENT ID, not our API
sub    : google-oauth2|1173............417   email: [redacted]
```

## What this confirms

- **It is a JWT**, not opaque — so the API can validate it offline, with no call to
  `/userinfo` per request.
- **`alg` is RS256** and **`kid` is `tOu0FHcN3C2etrel4Qhaz`**, which is one of the two keys in
  [`jwks.json`](jwks.json) — captured from the tenant *before any code was written*. The key
  saved at Phase 0 is the key that signed this token. That is the whole `kid`-selection
  design, closed end to end.
- **`iss` is `https://dev-yg.us.auth0.com/`**, trailing slash included, exactly as the guard
  compares it.
- **The access token's `aud` names our API. The id_token's `aud` is the client id.** Same
  `sub`, same signing key, same login — and only `aud` separates "who the user is" from
  "permission to call that API". Accepting the id_token at the API would be audience
  confusion. This is ADR-001, now observed rather than argued.

## The finding I did not expect: `aud` is an array

```
aud : ["https://bbl-candidate-test-api", "https://dev-yg.us.auth0.com/userinfo"]
```

Auth0 adds its own `/userinfo` audience alongside the requested API. So the rule is
**"`aud` must *include* our API"**, never `aud === our API`. A guard written as
`payload.aud === AUDIENCE` would compile, pass a hand-written test using a string audience,
and then reject **every genuine token the tenant issues**.

Our guard was already correct — `jose`'s `audience` option checks membership — but the test
suite only ever minted string audiences, so the real shape was untested. Two tests added
after seeing this:

- `accepts a token whose aud is an ARRAY that includes our API`
- `rejects an aud ARRAY that does not include our API`

This is the clearest argument in the whole project for the brief's "don't assume — verify":
the design was right by luck of library choice, and the test coverage was wrong, and only a
real token showed it.

---

## Without the audience parameter

```
$ node scripts/verify-token.mjs --no-audience

=== PKCE (S256) WITHOUT audience ===
code_verifier  : o8dxorwRhqgjmGC2mrBkXhdp_fUORyXbwmN9BTTJKwk
code_challenge : OBVd0VkzzdsRaEysCKsUAvWGiZtSl4xv-fGryCIrV1Y   (S256 of the verifier)

Listening on http://localhost:3000/callback ...
Got authorization code: vjvCCh1XYvnz...

--- access_token (444 chars) ---
NOT a JWT -> OPAQUE token.
value: eyJhbGciOiJkaXIiLCJlbmMi...

--- id_token ---
header : {"alg":"RS256","typ":"JWT","kid":"tOu0FHcN3C2etrel4Qhaz"}
aud    : "H9F6QG5SzTKMv0tbmgxLj9LjG1EKVllA"   <-- the CLIENT ID, not our API
sub    : google-oauth2|1173............417   email: [redacted]
```

Same login, same client, same signing key. The **only** difference from the run above is one
query parameter — and the access token changes from a 778-character verifiable JWT into a
444-character blob this API cannot check at all. Without `audience`, validating a caller
would mean an HTTP round-trip to `/userinfo` on every single request.

### The part that would fool a naive check

The opaque token **starts with `eyJ`**, exactly like a JWT. It is not one:

```
eyJhbGciOiJkaXIiLCJlbmMi...   ->   {"alg":"dir","enc...
```

`alg: dir` is JWE — a token *encrypted* to the tenant, five parts rather than three. Auth0
holds the key; we do not. So a guard that decided "is this a JWT?" with
`token.startsWith('eyJ')` would sail straight past this, then fail confusingly somewhere
further down. Our verifier never guesses: `jose` parses and verifies, and anything that is
not a valid RS256 JWT with the right `iss`/`aud`/`exp` is a 401.

### And the id_token is unaffected

Dropping `audience` changes the access token completely and leaves the id_token exactly as it
was — still RS256, still signed by `kid=tOu0FHcN3C2etrel4Qhaz`, still carrying the **client
id** as its `aud`. That is the cleanest statement of ADR-001 available: the id_token is a
statement about the user to the frontend, and it does not become an API credential no matter
what you ask for at login.
