# Private bookmark manager

A read-later app where everything is private to the person who created it. NestJS + Prisma +
SQLite behind Auth0, React + Vite + MUI in front.

The security property is the product: **a user must not see, edit, or even learn of the
existence of another user's data.** Every claim about that below maps to a test you can run.

```
backend/     NestJS 11 · TypeScript strict · Prisma 7 · SQLite · Auth0 JWT validation
frontend/    React 19 · Vite · TypeScript · React Router v8 · MUI v9 · PKCE login
.agent/      The /verify-privacy capability: static gate, slash command, subagent, hook
transcripts/ Real session logs, including the messy parts
```

| Document | What it holds |
|---|---|
| [`API_DESIGN.md`](API_DESIGN.md) | The contract, the enforcement mechanism, where the agent was wrong, and every claim mapped to its test |
| [`DECISIONS.md`](DECISIONS.md) | Nine ADRs — the calls the spec left open |
| [`AI_WORKFLOW.md`](AI_WORKFLOW.md) | How this was actually built, including four real failures |
| [`CLAUDE.md`](CLAUDE.md) | The agent rules file, written before any application code |
| [`.agent/README.md`](.agent/README.md) | The reusable capability, when and why it is invoked |

---

## Run it

**Prerequisites:** Node 22. (React Router v8 asks for ≥ 22.22 — it builds and runs fine on
22.18, which is what this was developed on, but npm will warn.)

### Backend

```bash
cd backend && npm install && cp .env.example .env && npx prisma migrate deploy && npm run db:seed && npm run dev
```

API on **http://localhost:4000**. Seeds two users with non-overlapping data.

### Frontend

```bash
cd frontend && npm install && cp .env.example .env && npm run dev
```

App on **http://localhost:3000**. Sign in as `candidate@test.com` / `@password1234`.

> **The frontend must be on port 3000.** The Auth0 tenant registers
> `http://localhost:3000/callback` as the only permitted callback URL and requires an exact
> match — I confirmed in Phase 0 that any other `redirect_uri` is rejected outright. `vite.config.ts`
> pins the port with `strictPort` so a collision fails loudly instead of silently breaking login.

> **Expected on every reload: an "Authorize App" consent screen and a fresh sign-in.**
> This is not broken. Two causes, only one of which is a decision of mine:
>
> - The access token is held **in memory only** and never in `localStorage`, so a reload has
>   no token ([ADR-002](DECISIONS.md)). Silent re-auth would normally cover this, but it runs
>   in a hidden iframe that Chrome blocks along with third-party cookies — so a full redirect
>   is the only route left.
> - Auth0 **will not skip the consent prompt for a `localhost` callback URL**; it cannot
>   attest to the app's identity there. On a real domain the grant is remembered and you see
>   it once. We do not administer this tenant, so this one is not ours to change.
>
> If you would rather not re-authenticate while reviewing, keep the tab open and navigate
> in-app — the token survives client-side routing, just not a hard reload.

### Docker

```bash
docker compose up --build
```

### Everything, in one command

```bash
npm install && npm run check
```

Privacy gate → typecheck → 110 tests.

---

## Run the tests

```bash
cd backend && npm test
```

```
Test Suites: 6 passed, 6 total
Tests:       110 passed, 110 total
Time:        ~9 s
```

| Suite | Proves |
|---|---|
| `auth.e2e-spec.ts` | 401 on every route × missing/malformed token, plus expired, wrong-audience, ID-token-shaped, wrong-issuer, forged-signature, unknown-`kid`, `alg:none` — and that the rejection *reason* is never disclosed |
| `isolation.e2e-spec.ts` | Alice vs Bob on every verb, all 404; lists, totals, search and `/all` never leak; cross-tenant collection writes; `ownerId` in body; a foreign id is indistinguishable from a nonexistent one; nothing returns 403 |
| `crud.e2e-spec.ts` | PUT-vs-PATCH semantics, the nullable relation, filters, error shape, `javascript:` URL rejection |
| `on-delete.e2e-spec.ts` | `SetNull` asserted on actual rows, at the database level |
| `first-login-race.e2e-spec.ts` | Concurrent first requests from a brand-new user all succeed and create exactly one `User` row — StrictMode double-fires effects, so this is the real shape of a first page load |
| `live-jwks.e2e-spec.ts` | Boots against the **real** Auth0 tenant and rejects a self-minted token. Self-skips (loudly) when offline |

### The privacy gate

```bash
npm run verify:privacy
```

```
  27 files, 17 Prisma calls on owned models
  PASS — every owned-model query is scoped by ownerId, and no route answers 403.
```

Static analysis over the TypeScript AST: every Prisma call on an owned model must carry an
`ownerId` predicate, `findUnique` is banned on those models (it cannot express one), and no
source file may return 403. Runs in CI before the tests, and in a `PostToolUse` hook so a
violation lands back in the agent's own turn.

### Verify the Auth0 tenant yourself

```bash
node scripts/verify-token.mjs                # with audience    → a JWT access token
node scripts/verify-token.mjs --no-audience  # without audience → an OPAQUE token
```

A real Authorization Code + PKCE (S256) flow, hand-rolled with `node:crypto`, no
dependencies. It prints the authorize URL, catches the callback, exchanges the code, and
decodes what comes back. Your password is typed into Auth0's own page, never into the script.
Run both and the reasoning in [ADR-001](DECISIONS.md) becomes something you can see rather
than take on trust.

---

## The security claims, and where they are proven

| Claim | Mechanism | Proof |
|---|---|---|
| Every route requires a valid access token | `AuthGuard` as a global `APP_GUARD` — protection is the default, `@Public()` is the exception (used once, on `/health`) | 30 assertions in `auth.e2e-spec.ts` |
| Tokens are genuinely validated | RS256 via tenant JWKS keyed by `kid`, `algorithms` pinned, exact `iss`, `aud` must include our API, `exp` | 8 named rejection tests + the live-tenant suite |
| The API rejects ID tokens | `aud` must be the API audience, not the client id | `rejects an ID-token-shaped token` |
| A user cannot read or write another's data | `ownerId` in the `where` of every query, in the same atomic statement as the write | 10 cross-owner tests, all asserting 404 |
| A user cannot learn data *exists* | 404 not 403; identical error bodies; list filters 404 rather than returning empty | `no route anywhere answers 403`, plus a body-equality test |
| A user cannot write into another's collection | Parent ownership re-checked on create, PUT and PATCH | 4 tests — and mutation-tested |
| `ownerId` from a client is never honoured | Owner comes from the verified `sub`; `forbidNonWhitelisted` rejects the field | 4 tests |
| Deleting a collection keeps its bookmarks | `onDelete: SetNull` in the migration SQL | 4 tests, asserted on rows |
| The tests actually catch regressions | Three deliberate mutations | [`transcripts/phase-5-mutation-testing.md`](transcripts/phase-5-mutation-testing.md) |

---

## Done vs skipped

### Done

- **§3.1 Backend** — NestJS + TypeScript, OIDC on every route, `/collections` and
  `/bookmarks` with get-one/list/create/PUT/PATCH/DELETE/filtering, `/collections/:id/bookmarks`,
  `/me`, SQL via Prisma, seed data for two users.
- **§3.2 Frontend** — React + Vite + TS, React Router v8, MUI v9, Authorization Code + PKCE
  (S256), both required pages.
- **§3.3** — resolved as a documented decision with a test that enforces the boundary
  ([ADR-004](DECISIONS.md)).
- **Bonuses** — Dockerfiles for both services + compose; GitHub Actions CI (gate → typecheck →
  tests → build); the `/all` page; full-text search across bookmark title, notes and URL.

### Skipped, deliberately

- **Sharing is not implemented.** Designed in full in [ADR-004](DECISIONS.md) — grant table,
  read-vs-write, revocation, how 404-on-non-owner survives — and *not built*, because a
  half-built sharing feature weakens the exact property this app exists to demonstrate. A test
  asserts no sharing route exists, so the decision cannot rot silently.
- **No frontend tests.** With finite time, tests on the layer that cannot enforce anything are
  worth less than tests on the layer that can. `RequireAuth` is convenience; the backend guard
  is the control. I would rather ship none and say so than ship shallow ones that imply
  coverage I do not have.

  **The honest counterargument:** the one bug that reached a user was a frontend routing bug
  (the `/callback` failure above), and it is exactly the kind a single render test would have
  caught — "`/callback` does not alter `window.location.search`". The reasoning above is still
  right about *priority*; it was wrong to conclude the right number was zero. That test is the
  first thing I would add.
- **No browser end-to-end test of the login flow.** It needs a real password in CI and breaks
  whenever Auth0 restyles its login page. The token *validation* path — the part I own — is
  covered exhaustively instead, and PKCE is verifiable by hand with `scripts/verify-token.mjs`.
- **No rate limiting.** A real gap, not an oversight: `/health` and the auth path are
  unthrottled. In production this needs a limiter keyed on IP and on `sub`.
- **No refresh tokens.** A hard page reload requires re-authentication when silent auth is
  blocked by third-party-cookie policy. The cost of memory-only token storage, accepted
  knowingly ([ADR-002](DECISIONS.md)).
- **SQLite, not Postgres.** One-command setup, and nothing in the schema is engine-specific.
  The one real wrinkle: `contains` compiles to `LIKE`, which is ASCII-case-insensitive on
  SQLite but not on Postgres ([ADR-007](DECISIONS.md)).

### Known rough edges

- The `/callback` route was initially wired to redirect immediately, which stripped Auth0's
  `?code=` before the SDK could read it and made sign-in silently do nothing. Fixed
  ([AI_WORKFLOW.md](AI_WORKFLOW.md), failure 4) — worth reading because it sat exactly one
  step past where automated verification could reach.

- Search is `LIKE`-based. Correct at this scale, will not scale.
- No optimistic concurrency — last write wins on `PUT`.
- The frontend refetches lists after each mutation rather than updating cache.
- `docker compose up` runs `prisma migrate deploy` in the container's start command. Fine for a
  demo; in production migrations belong in a release step, not an entrypoint that a
  crash-looping pod re-runs.

---

## A note on how this was built

Per the brief, most of this was written by an AI agent (Claude Code, Opus 5) under a written
rules file, phase by phase, with each phase committed separately. The commit history is the
real one — including the fixes.

What is *not* delegated, and what I would defend at an on-site: the token decision
([ADR-001](DECISIONS.md), derived from probing the tenant before writing any auth code), the
§3.3 boundary ([ADR-004](DECISIONS.md)), and the verification strategy — in particular the
decision to mint test tokens against a local JWKS rather than mock the guard or ship a login
bypass ([ADR-006](DECISIONS.md)).

The three places the agent's first attempt was wrong, and how each was found, are in
[`API_DESIGN.md` §7](API_DESIGN.md). One of them — a mutation test that "passed" when it
should have failed — turned out to be the most useful thing I learned about this codebase.
