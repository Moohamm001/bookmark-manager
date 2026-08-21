# API_DESIGN.md

The contract, and — more to the point — the mechanism that makes the privacy invariant true
rather than merely intended.

Base URL in development: `http://localhost:4000`.

---

## 1. Authentication

Every route except `GET /health` requires:

```
Authorization: Bearer <Auth0 access token>
```

**The API accepts the access token, never the ID token.** The reasoning is derived from what
the tenant actually does, not assumed — the evidence is in
[`transcripts/phase-0-auth0/FINDINGS.md`](transcripts/phase-0-auth0/FINDINGS.md). In short:

- The access token is only a *verifiable JWT* because the frontend requests
  `audience=https://bbl-candidate-test-api`. Without that parameter Auth0 returns an
  **opaque** token that this API could not validate offline at all.
- The access token's `aud` names **this API**. The ID token's `aud` is the **client id**.
  Accepting an ID token at an API is audience confusion: any token minted for that SPA would
  open this API.
- The tenant offers HS256 for ID tokens — signed with the *client secret*, not a JWKS key.
  This API has no client secret and should never need one.

Validation performed by [`TokenVerifierService`](backend/src/auth/token-verifier.service.ts),
in this order:

| Check | Value | Why it is not optional |
|---|---|---|
| Signature | RS256 via tenant JWKS, key chosen by header `kid` | The tenant publishes **two** keys; "use the first key" works today and breaks on rotation |
| `algorithms` | pinned to `['RS256']` | Otherwise a token nominates its own algorithm — this is where `alg: none` and HS256-confusion die |
| `iss` | exactly `https://dev-yg.us.auth0.com/` | Trailing slash included; a near-match issuer is a different tenant |
| `aud` | must include `https://bbl-candidate-test-api` | The check most often skipped. Signature-valid but audience-unchecked means *any* token the tenant ever issued opens this API |
| `exp` / `nbf` | 5s clock tolerance | — |

The guard is registered as an `APP_GUARD` in
[`app.module.ts`](backend/src/app.module.ts), so **every route is protected by default**.
Public routes must opt out with `@Public()`; exactly one does (`/health`, which returns a
constant). This direction matters: forgetting to think about auth on a new controller
produces a 401, not an open door.

The rejection **reason is never disclosed** — expired, wrong-audience and forged all return
the identical body. Telling a caller which check failed is free reconnaissance.

---

## 2. Resources

### `GET /me`

The signed-in person: `{ id, auth0Sub, email }`.

There is deliberately **no `GET /users/:id`**. In an app whose premise is that users cannot
learn of each other, a user-by-id endpoint is an enumeration oracle.

### `/collections`

| Verb | Path | Success | Notes |
|---|---|---|---|
| GET | `/collections` | 200 | Paginated list |
| GET | `/collections/:id` | 200 | |
| GET | `/collections/:id/bookmarks` | 200 | Paginated; 404 if the collection is not yours |
| POST | `/collections` | 201 | Body: `{ name }` |
| PUT | `/collections/:id` | 200 | Full replace — `name` required |
| PATCH | `/collections/:id` | 200 | Partial |
| DELETE | `/collections/:id` | 204 | Bookmarks inside survive (see §5) |

`Collection`: `{ id, name, ownerId, createdAt, updatedAt }`

### `/bookmarks`

| Verb | Path | Success | Notes |
|---|---|---|---|
| GET | `/bookmarks` | 200 | Paginated list |
| GET | `/bookmarks/:id` | 200 | |
| POST | `/bookmarks` | 201 | Body: `{ url, title, notes?, collectionId? }` |
| PUT | `/bookmarks/:id` | 200 | Full replace — `url` and `title` required; omitted `notes`/`collectionId` become `null` |
| PATCH | `/bookmarks/:id` | 200 | Partial; `notes: null` and `collectionId: null` are meaningful values |
| DELETE | `/bookmarks/:id` | 204 | |

`Bookmark`: `{ id, url, title, notes, collectionId, ownerId, createdAt, updatedAt }`

`url` must be `http` or `https`. This is a **security control, not tidiness**: these values
are rendered as anchor `href`s in the frontend, so `javascript:` and `data:` URLs are stored
XSS. Rejecting them at the write boundary means the frontend is not the only thing between a
stored value and script execution.

### `GET /all` (backs the bonus page)

`{ collections: [{ ...collection, bookmarks: [...] }], uncategorised: [...] }`

One request, nested server-side. The nested `include` carries **its own** `ownerId` filter —
the outer scope alone would be sufficient today, but a nested read that trusts its parent is
exactly the query that stops being safe the moment anyone adds sharing.

### `GET /health`

The only public route. Returns `{ "status": "ok" }` and nothing else — an unauthenticated
endpoint that reports row counts, versions or database state is a free oracle.

---

## 3. List parameters

| Param | Applies to | Default | Notes |
|---|---|---|---|
| `q` | both | — | Collections: matches `name`. Bookmarks: matches `title`, `notes`, `url` |
| `collectionId` | bookmarks | — | **404 if the collection is not yours** — see below |
| `uncategorised` | bookmarks | `false` | `true` returns only bookmarks with no collection |
| `limit` | both | 25 | 1–100; outside the range is a 400 |
| `offset` | both | 0 | |
| `sortBy` | both | `createdAt` | `createdAt`, `updatedAt`, `title`, `name` |
| `sortDir` | both | `desc` | `asc` \| `desc` |

Response envelope:

```json
{ "data": [ ... ], "total": 42, "limit": 25, "offset": 0 }
```

`total` is **scoped to the caller**. A correct `data` array beside a global `total` would
still leak how much other people have stored — and it is exactly the kind of thing that
survives review. There is a test for it.

`?collectionId=<someone else's>` returns **404, not an empty 200**. An empty list would
confirm the id is well-formed-but-not-yours versus nonexistent; the filter would become an
existence oracle. The status codes must be indistinguishable.

---

## 4. Status codes and error shape

| Code | When |
|---|---|
| 200 | GET, PUT, PATCH |
| 201 | POST |
| 204 | DELETE |
| 400 | DTO validation failed, **including an unexpected property such as `ownerId`** |
| 401 | Missing, malformed, expired, wrong-audience, wrong-issuer or wrongly-signed token |
| 404 | Not found **or owned by someone else — these are indistinguishable** |
| 500 | Unexpected. Logged server-side; the body is generic |

**403 is never returned by any route.** There is a test named `no route anywhere answers 403`
that asserts it.

Every response, on every route, has the same shape
([`AllExceptionsFilter`](backend/src/common/filters/all-exceptions.filter.ts)):

```json
{
  "statusCode": 404,
  "error": "Not Found",
  "message": "Collection not found",
  "path": "/collections/abc",
  "timestamp": "2026-08-20T15:31:15.881Z"
}
```

Uniformity is itself the control. If the 404 for "does not exist" carried a different message
from the 404 for "belongs to someone else", the 404-not-403 rule would leak through the body
instead of the status code and we would have gained nothing. A test asserts the two bodies are
identical.

Unexpected errors are logged but returned generic — Prisma errors in particular happily echo
table names, constraint names and column values.

---

## 5. The relation, and on-delete

```
User 1───n Collection 1───n Bookmark
     └──────────────n────────────┘
```

`ownerId` is **non-null on both** `Collection` and `Bookmark`. A bookmark's owner is stored
directly rather than inferred through its collection, because `collectionId` is nullable — an
uncategorised bookmark would otherwise have no owner at all. It also means every bookmark
query is scoped with one equality predicate instead of a join.

| Delete | Behaviour | Set where |
|---|---|---|
| Collection | `SET NULL` — bookmarks survive, become uncategorised | `onDelete: SetNull`, in the migration SQL |
| User | `CASCADE` — their collections and bookmarks go with them | `onDelete: Cascade` |

Content is cascaded from its **owner** but not from its **folder**. Rationale in
[`DECISIONS.md` ADR-003](DECISIONS.md).

> **Review hazard, learned the hard way.** The referential action that is actually in force
> lives in the **committed migration SQL**, not in `schema.prisma` at runtime. Editing the
> schema without generating a migration changes nothing. I found this while mutation-testing
> — flipping `SetNull` to `Cascade` in the schema produced a green test run, because the edit
> had never reached a database. Anyone reviewing a schema diff here has to check the migration
> too. (Full story in
> [`transcripts/phase-5-mutation-testing.md`](transcripts/phase-5-mutation-testing.md).)

---

## 6. How the privacy invariant is enforced, in code

Four layers. Each is independently checkable, and none is load-bearing alone.

### Layer 1 — identity can only come from the token

The guard resolves the verified `sub` to a `User` row and attaches it to the request.
[`@CurrentUser()`](backend/src/auth/current-user.decorator.ts) is the only sanctioned way for
a controller to learn who is calling. Making the safe path the convenient one is deliberate:
the unsafe path then does not get written.

Backstop: the global `ValidationPipe` runs with `whitelist: true` **and**
`forbidNonWhitelisted: true`, so a body carrying `ownerId` is rejected with a 400 rather than
silently stripped. See [ADR-005](DECISIONS.md) for why rejecting beats stripping.

### Layer 2 — scoping lives in the data-access layer

Every service method takes `ownerId` as its **first parameter**, and every Prisma call puts it
in the `where`:

```ts
// collections.service.ts
async findOne(ownerId: string, id: string): Promise<Collection> {
  const collection = await this.prisma.collection.findFirst({ where: { id, ownerId } });
  if (!collection) notFound('Collection');
  return collection;
}

async remove(ownerId: string, id: string): Promise<void> {
  try {
    await this.prisma.collection.delete({ where: { id, ownerId } });   // atomic
  } catch (err) {
    rethrowAsNotFound(err, 'Collection');
  }
}
```

Two properties worth naming:

- **No fetch-then-check anywhere.** `update` and `delete` pass `{ id, ownerId }` in the same
  statement as the write, so the scoping happens atomically. A controller that fetched a row
  and then compared owners would be one deleted `if` away from a leak, and a race in the
  meantime.
- **`findUnique` is not used and is banned by the gate.** It accepts only a unique field, so
  it structurally *cannot* say "…and it is mine". The unsafe call is made impossible rather
  than discouraged.

There is not a single ownership `if` statement in any controller. That is the design.

### Layer 3 — the static gate

[`.agent/scripts/verify-privacy.ts`](.agent/scripts/verify-privacy.ts), run by
`npm run verify:privacy`, by a `PostToolUse` hook, and by CI ahead of the tests. It parses the
TypeScript AST and fails the build on: a Prisma call on an owned model with no `ownerId`
predicate; any `findUnique` on an owned model; any `403` in the source.

This exists because the e2e suite only covers routes someone thought to test. The gate covers
the route added next month and forgotten — which is where the leak will actually be.

### Layer 4 — the tests

[`backend/test/isolation.e2e-spec.ts`](backend/test/isolation.e2e-spec.ts) runs Alice against
Bob's real rows on every verb. Crucially it asserts against the **database** after a rejected
write, not just the status code — a handler that 404s *after* writing would pass a
status-only test. Mutation testing is what proved that necessary.

---

## 7. Where the agent's first attempt was wrong

An honesty note first, because the distinction matters more than the list: the two classic
multi-tenant holes below (§7.4) were **designed against from the start**, not discovered in
broken code. I am not going to dress them up as bugs I heroically caught — what I can claim
is that I *verified* the defences are load-bearing, by removing them and watching the tests
go red. The three items in §7.1–7.3 are genuine first-attempt failures.

### 7.1 `tsx` silently drops `emitDecoratorMetadata`, so DI injected `undefined`

**What happened.** The backend dev/test scripts were scaffolded with `tsx`, which is fast and
the obvious modern choice. `npx tsc --noEmit` was clean. On boot:

```
ERROR [ExceptionHandler] TypeError: Cannot read properties of undefined (reading 'getOrThrow')
    at new TokenVerifierService (src/auth/token-verifier.service.ts:34:26)
```

**Why it is worth recording.** `tsx` uses esbuild, and esbuild does not implement
`emitDecoratorMetadata`. NestJS resolves constructor dependencies from exactly that metadata,
so every injected service silently became `undefined`. Nothing in the type system can see
this: the types are correct, the code is correct, the *build tool* is wrong.

**How I found it.** By running the server, not by typechecking. This is the reason the
smoke-test step exists in my loop at all — a whole class of failure is invisible to `tsc`.

**Fix.** Build and run through the tsc-based Nest CLI. `tsx` is still used for standalone
scripts with no DI (seeding, the privacy gate), where the limitation does not apply.

### 7.2 The privacy gate's first version cried wolf on correct code

**What happened.** The first cut of `verify-privacy.ts` inspected only inline object literals.
Against the real codebase it produced four confident failures:

```
backend/src/bookmarks/bookmarks.service.ts:66
  problem: bookmark.findMany() has no ownerId in its where clause
  code   : this.prisma.bookmark.findMany({
```

All four were **correct code**. The services build the filter first
(`const where = { ownerId, ...filters }`) and pass `{ where }` by shorthand, which the
analyser could not see through.

**Why it matters more than it looks.** A false positive in a security gate is worse than a
missed detection, because the reaction to a noisy gate is to stop running it — or to
suppress the finding, which trains everyone that suppressions are routine. The gate's
credibility *is* its function.

**Fix.** `resolveLocalBinding` follows an identifier to its `const` declaration in the same
file before checking for `ownerId`. Deliberately simple and file-scoped: if two `where`
consts in one file disagree, it errs toward flagging.

### 7.3 A mutation test "passed" when it should have failed — and the reason was the real finding

**What happened.** Verifying the on-delete tests had teeth, I flipped `onDelete: SetNull` to
`Cascade` in `schema.prisma` and re-ran. All four tests stayed green. My first read was that
the tests were weak.

**The tests were right and I was wrong.** `prisma migrate dev` had exited non-zero and I had
piped its output to `/dev/null`, so no migration was ever generated and the edit never
reached a database. `prisma/migrations/` still held only `init`, still saying
`ON DELETE SET NULL`.

**Why it is worth writing down.** It is a genuine review hazard in this codebase: the
referential action in force lives in the committed migration SQL, not in `schema.prisma`. A
reviewer approving a schema diff here is not looking at what the database will do. It is now
called out in §5, and it is the reason I re-ran the mutation against the migration SQL —
where it failed three tests, correctly.

**Meta-lesson.** When a mutation does not get caught, the first hypothesis to test is that
the mutation did not land. I nearly rewrote perfectly good tests.

### 7.4 Two holes I designed against rather than discovered — and how I proved the defences work

These are the classic multi-tenant failures. I built the checks up front, so I cannot honestly
claim to have found them broken. What I *can* claim is that I did not take them on faith.

**(a) Filing a bookmark into someone else's collection.** `POST /bookmarks` with
`collectionId` set to Bob's collection. The bookmark is owned by Alice, so every ownership
check passes and the static gate is satisfied — but the row lands **inside Bob's collection**
and appears in his `GET /collections/:id/bookmarks`. The check has to be on the *parent*, and
it has to be on create, `PUT` **and** `PATCH`, because "move into a collection" is the same
operation as "create there".

**(b) A list filter as an existence oracle.** `GET /bookmarks?collectionId=<Bob's>` scoped by
`ownerId` would find nothing and return `200 { data: [], total: 0 }` — a perfectly correct,
gate-passing query. But if a foreign-but-real id behaves differently from a fabricated one on
*any* endpoint, existence has leaked. So the filter calls `assertOwned` and 404s, exactly like
a direct fetch.

**Verification.** I removed defence (a) and ran the suite:

```
× Alice cannot CREATE a bookmark inside Bob collection -> 404
× Alice cannot MOVE her bookmark into Bob collection with PUT -> 404
× Alice cannot MOVE her bookmark into Bob collection with PATCH -> 404
× Bob collection still contains exactly his own bookmarks
```

All three verbs, plus the assertion that reads Bob's collection contents **from the database**
rather than trusting the status code — which is what would catch a handler that 404s *after*
writing. Full transcript in
[`transcripts/phase-5-mutation-testing.md`](transcripts/phase-5-mutation-testing.md).

---

## 8. Every security claim, mapped to the test that proves it

If a claim is not in this table, it is not a claim I am making.

| Claim | Test |
|---|---|
| Every route requires a token | `Authentication › rejects unauthenticated access on EVERY route` (30 cases) |
| Expired tokens rejected | `rejects an EXPIRED token` |
| Wrong audience rejected | `rejects a token whose audience is NOT our API` |
| ID tokens rejected | `rejects an ID-token-shaped token (aud = client id, not the API)` |
| Wrong issuer rejected | `rejects a token from a DIFFERENT issuer` |
| Signatures are actually verified | `rejects a token signed by a key that is not in the JWKS` |
| `alg: none` rejected | `rejects an unsigned alg=none token` |
| Unknown `kid` rejected | `rejects a token with an unknown kid` |
| Failure reason not disclosed | `does not tell the caller WHY a token was rejected` |
| The real tenant path works | `Live Auth0 JWKS path › a self-minted token is REJECTED against the real tenant keys` |
| A cannot read B | `Alice cannot READ Bob rows` (4 cases) |
| A cannot write B | `Alice cannot WRITE to Bob rows` (6 cases) |
| Rejected writes really did not write | `none of the above actually mutated Bob rows` |
| Lists never leak | `list endpoints never leak another user rows` (5 cases) |
| `total` is caller-scoped | `the total count is scoped to the caller, not global` |
| Search does not cross owners | `search does not reach across owners` |
| No cross-tenant collection writes | `cross-tenant writes into another user container` (4 cases) |
| `ownerId` in body ignored | `ownerId supplied by the client is never honoured` (4 cases) |
| Foreign id ≡ nonexistent id | `the 404 body for a real foreign id equals the 404 body for a fabricated id` |
| Nothing returns 403 | `no route anywhere answers 403` |
| Sharing is not implemented | `there is no route that grants another user access to a collection` |
| `SetNull` on collection delete | `Collection delete behaviour (ADR-003: SetNull)` (4 cases) |
| Stored XSS via URL blocked | `POST rejects a javascript: URL with 400` (+3 more) |
| PUT is a full replace | `PUT is a genuine full replace: omitted notes becomes null` |
| PATCH is partial | `PATCH leaves omitted fields untouched` |
| Consistent error shape | `returns a consistent error shape on every failure` |

`npm test` in `/backend` — 110 tests, about 9 seconds.

---

## 9. What is deliberately NOT tested, and why

Choosing this is as much a decision as choosing what to cover.

- **Auth0 itself.** I test *our validation of its tokens*, not whether Auth0 signs correctly.
  Testing a vendor's crypto is someone else's job and would fail for reasons I cannot fix.
- **The browser login flow, end to end.** No Playwright run of the real Universal Login. It
  needs a real password in CI, it breaks whenever Auth0 changes its login page, and it would
  test their UI more than my code. Instead: PKCE is exercised by hand via
  `scripts/verify-token.mjs`, and the token *validation* path — the part I own — is covered
  exhaustively.
- **Load, concurrency, rate limiting.** No rate limiter is shipped, so there is nothing to
  test. That is a real gap and it is listed as such in the README rather than hidden.
- **The frontend, at unit level.** Zero frontend tests, deliberately. With finite time, tests
  on the layer that cannot enforce anything are worth less than tests on the layer that can.
  `RequireAuth` is convenience; the backend guard is the control. I would rather ship no
  frontend tests and say so than ship shallow ones that imply coverage I do not have.
- **Prisma's own referential integrity.** I assert that *my* schema produces `SET NULL`
  behaviour; I do not test that SQLite implements foreign keys.
