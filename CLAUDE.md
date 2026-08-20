# CLAUDE.md — agent rules for this repo

Read this before touching anything. It is the contract; the spec PDF is not in this repo.

## What this is

A **private** bookmark manager, built as a monorepo:

- `/backend` — NestJS 11 + TypeScript (strict) + Prisma 7 + SQLite. Auth via Auth0 OIDC.
- `/frontend` — React 19 + Vite + TypeScript + React Router v8 + MUI v9.

Two resources: **collections** and **bookmarks**. A bookmark may belong to one collection, or none.

## The one invariant that must never break

> Every row is PRIVATE to the user who created it. A user must not see, edit, or even learn of the
> **existence** of another user's data.

Non-negotiable rules that follow from it:

1. **Ownership is enforced at the data-access layer.** Every Prisma call that touches `Collection` or
   `Bookmark` includes `ownerId` in its `where`. Never fetch-then-check in a controller — that is one
   forgotten `if` away from a leak, and it is unverifiable by static analysis.
2. **Cross-owner or missing → `404`, never `403`.** A 403 confirms the row exists, which is itself a
   leak. Someone else's id and a nonexistent id must be indistinguishable to the caller.
3. **Owner identity comes only from the verified access-token `sub`.** Never read `ownerId` from a
   body, query string, or header. If a request body carries `ownerId`, it is stripped, not honoured.
4. **Never weaken the invariant to make a test pass.** Fix the code, not the test.

`npm run verify:privacy` (in `/backend`) statically checks rule 1 and fails the build on a violation.
It runs in CI. If you add a data-access path, it must pass — do not add it to the ignore list without
saying why in the PR.

## Auth (verified against the tenant, not assumed — see `/transcripts/phase-0-auth0/FINDINGS.md`)

- Tenant `dev-yg.us.auth0.com`, issuer `https://dev-yg.us.auth0.com/` (**trailing slash**).
- **Authorization Code + PKCE with S256 only.** The tenant also permits implicit and `plain` PKCE; we
  use neither.
- The API accepts the **access token** as Bearer. Its `aud` must include
  `https://bbl-candidate-test-api`. The **ID token is never accepted by the API** — its `aud` is the
  client id, and accepting it is audience confusion.
- Validation: RS256 signature via the tenant JWKS (key chosen by the token header `kid`, cached, and
  refetchable on rotation — the tenant publishes two keys), plus `iss`, `aud`, and `exp`. Anything
  else → `401`.
- A **global** guard (`APP_GUARD`) protects every route. Never protect routes one controller at a
  time; a per-controller guard is one new file away from being forgotten. Public routes opt out
  explicitly with `@Public()`.

## API rules

- Resources `/collections` and `/bookmarks`, each with: `GET` one, `GET` list, `POST`, `PUT` (full
  replace), `PATCH` (partial), `DELETE`. Plus `GET /collections/:id/bookmarks`, `GET /me`.
- Validate every input with a DTO + `class-validator`. Global `ValidationPipe` with
  `whitelist: true` and `forbidNonWhitelisted: true` — this is what strips a smuggled `ownerId`.
- `PUT` requires the full body. `PATCH` accepts a subset. They are different DTOs; do not share one.
- **Creating or moving a bookmark into a collection must verify that collection is owned by the same
  user, else `404`.** This is the classic cross-tenant hole: otherwise A files a bookmark into B's
  collection.
- One consistent error shape on every route. Status codes are documented in `API_DESIGN.md`.

## Data model

- `User(id, auth0Sub UNIQUE, email, createdAt, updatedAt)`
- `Collection(id, name, ownerId NOT NULL → User, createdAt, updatedAt)`
- `Bookmark(id, url, title, notes?, collectionId? → Collection, ownerId NOT NULL → User, createdAt, updatedAt)`

`ownerId` is non-null on **both** resources — a bookmark's owner is stored directly, not inferred
through its collection, because `collectionId` is nullable and an uncategorised bookmark still has an
owner.

**On collection delete: `onDelete: SetNull`** — the bookmarks survive and become uncategorised. A
collection is an organisational container, not the owner of the content. This is set explicitly in
the schema, never left to a default. See `DECISIONS.md`.

## Testing (non-negotiable)

Any security claim in any markdown file in this repo must map to a named, runnable test. An unbacked
claim scores zero — treat it as a bug.

Required coverage, each as a separately named test:
- `401` on missing / malformed / expired / wrong-signature token.
- Token with the **wrong audience** rejected.
- User A cannot `GET`/`PUT`/`PATCH`/`DELETE` user B's collection or bookmark → each `404`.
- List endpoints never return another user's rows.
- User A cannot create or move a bookmark into user B's collection → `404`.
- `ownerId` in a create/update body is ignored; the row belongs to the authenticated user.
- The `SetNull` on-delete behaviour is asserted on the actual resulting rows.

## Working style

- TypeScript `strict`. **No `any` in committed code** — if you reach for it, the type is wrong.
- Do not invent endpoints, fields, or dependencies beyond this file without asking.
- Finish a unit of work, then stop and show a diff/summary before moving on.
- Commit in meaningful steps. The commit history is a graded deliverable; do not squash it.
