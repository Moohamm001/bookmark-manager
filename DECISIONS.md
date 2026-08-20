# DECISIONS.md

ADR-style, short. The calls where the spec was silent — what I chose, what I gave up, and
(because this is a take-home about steering agents) how I got the agent to build *my* choice
instead of its default.

> **A note on authorship.** The code here was largely agent-written; these decisions were
> not. Where an agent's default differed from my call, I have said so explicitly, because
> "the agent picked it" is not a defensible answer at an on-site.

---

## ADR-001 — The API accepts the **access token**, not the ID token

**Status:** decided in Phase 0, before any auth code was written.

**Context.** The brief deliberately refuses to say which token to use, and says to verify what
the tenant supports rather than assume. So the first thing I did was inspect the tenant:
discovery document, JWKS, and two `/authorize` probes.

**Decision.** The API accepts the **access token**, validated RS256-via-JWKS with `iss`, `aud`
and `exp` checked. The ID token is for the frontend and is never accepted by the API.

**Why — from evidence, not doctrine** (raw responses in
[`transcripts/phase-0-auth0/FINDINGS.md`](transcripts/phase-0-auth0/FINDINGS.md)):

1. The access token is only a *verifiable JWT* because we request
   `audience=https://bbl-candidate-test-api`. I proved that audience is a real registered
   Resource Server without needing credentials: the same `/authorize` request with a bogus
   audience comes back `access_denied — Service not found`. Drop the audience and Auth0
   issues an **opaque** token, which this API could not validate offline at all — it would
   have to call `/userinfo` on every single request.
2. `aud` on the access token names **this API**. On the ID token it names the **client id**.
   Accepting an ID token at an API is audience confusion: every token minted for that SPA
   becomes a key to our data.
3. The tenant advertises `HS256` among `id_token_signing_alg_values_supported`. An HS256 ID
   token is signed with the *client secret*, not a JWKS key. This API has no client secret and
   should never need one; RS256-via-JWKS is the only validation path I want to own.

**Trade-off.** The access token carries no reliable `email` claim (that is an ID-token claim
unless the tenant adds it). So `UsersService` treats email as best-effort display metadata
with a synthetic fallback, and **never** as an authorisation input. Identity is the `sub`.

**Steering.** No steering needed — this was settled before code existed, which is precisely
why I did Phase 0 first. Had I asked an agent to "add Auth0 auth" cold, the odds of getting
audience validation for free were poor; it is the single most commonly omitted check.

---

## ADR-002 — Access token kept **in memory** on the frontend

**Decision.** `@auth0/auth0-react` with `cacheLocation="memory"`, stated explicitly rather
than relied on as a default. No `localStorage`, no `sessionStorage`. `useRefreshTokens` is
off.

**Why.** `localStorage` is readable by any script on the origin. One XSS anywhere in the app —
or in any of its transitive dependencies — becomes a stolen bearer token for our API, valid
until it expires, exfiltrated silently. A token in a closure dies with the tab.

**What I gave up, honestly.** A full page reload loses the token. With no `offline_access` in
the brief's scope, no refresh token is issued, so the SDK falls back to silent authentication
in a hidden iframe — which browsers blocking third-party cookies will refuse. When that
happens the user is bounced to the Auth0 login page again. That is a real UX cost on Safari
and hardened Firefox, and for a *privacy-first* app I will pay a redirect rather than store a
bearer token where script can read it.

**The alternative I rejected.** Refresh tokens with rotation, stored in memory, would fix the
reload. It needs `offline_access` added to the scope — a change to the brief's stated
configuration — and it introduces a longer-lived credential. Worth revisiting for a real
product; not worth quietly widening the scope for a take-home.

**Steering.** Agents default to `localStorage` here, because most tutorials do. I specified
memory storage in `CLAUDE.md` before the frontend existed.

---

## ADR-003 — Deleting a collection **sets its bookmarks' `collectionId` to NULL**

**The ambiguity.** §3.3 says only "a user can delete a collection". Cascade and set-null are
both defensible.

**Decision.** `onDelete: SetNull`. Bookmarks survive and become uncategorised.

**Why.** A collection is an *organisational container*, not the owner of the content. The
thing the user values is the saved link; the folder is how they filed it. Deleting a folder
should not destroy its contents on one click. The schema already permits
`collectionId = null` — an uncategorised bookmark is a first-class, legal state — so
set-null lands the data in a state the app already handles rather than an edge case.

The asymmetry is the point, and it is deliberate: **deleting a user *does* cascade.** Content
is destroyed with its *owner*, never with its *folder*. Both behaviours are asserted, in
`on-delete.e2e-spec.ts`.

**What I gave up.** Users who expect "delete the folder, delete the contents" get an
uncategorised pile instead. Mitigated in the UI: the delete dialog says in as many words that
the bookmarks will not be deleted. The reverse mistake is unrecoverable, and that asymmetry
decided it.

**Made explicit, not defaulted.** `onDelete: SetNull` is written in the schema even though it
happens to be Prisma's default for an optional relation, so that a future change to a required
relation cannot flip the behaviour silently. I verified it reached the migration SQL
(`ON DELETE SET NULL`) rather than trusting the schema — and then verified the tests catch a
flip, which is where I learned the schema/migration gap documented in `API_DESIGN.md` §5.

---

## ADR-004 — Sharing (§3.3): **designed, deliberately not built**

**The requirement, in full:** *"Collections hold bookmarks. A user can delete a collection. A
user may want to share a collection with someone else."*

**Decision.** Ship no sharing. Design it properly here, and add a **test asserting it does not
exist**.

**Why.** The invariant this app is graded on is that a user cannot see, edit, or learn of the
existence of another user's data. Sharing is, by definition, a hole punched in that invariant.
A half-built sharing feature would be the worst of both worlds: it weakens the property the
whole app exists to demonstrate, and it does so without the surrounding machinery
(revocation, audit, grant scoping) that would make it safe. "A user *may want to*" is also the
weakest phrasing in the brief — it is a want, not a requirement, and it arrived without a
single answer about semantics.

**What I would need to answer first**, none of which the spec settles:

- **Who is the grantee?** Users cannot enumerate each other (that is the invariant). So
  sharing must be by email invitation to an identity that may not have an account yet — which
  means an invitation lifecycle, not just a join table.
- **Read or write?** If a grantee can add bookmarks to my collection, whose are they? The
  bookmark's `ownerId` and the collection's `ownerId` diverge, and every query in the app
  currently assumes they do not.
- **Revocation.** Instant, or on next token refresh? Cached list responses?
- **Transitivity.** Can a grantee re-share? (No — but that has to be enforced, not assumed.)
- **Deletion.** If I delete a collection shared with you, do your links vanish?

**What I would build, if asked:**

```prisma
model CollectionShare {
  id           String     @id @default(cuid())
  collectionId String
  collection   Collection @relation(fields: [collectionId], references: [id], onDelete: Cascade)
  granteeId    String
  grantee      User       @relation(fields: [granteeId], references: [id], onDelete: Cascade)
  permission   String     // 'read' only, initially
  createdAt    DateTime   @default(now())

  @@unique([collectionId, granteeId])
}
```

The rules that keep the invariant intact:

1. Visibility widens **only for named grantees**, never globally. The scoping predicate goes
   from `ownerId = me` to `ownerId = me OR id IN (my grants)` — an explicit enumerated set,
   still at the data-access layer, still one predicate.
2. **404 stays 404.** A non-owner, non-grantee gets exactly what they get today. The grant
   list is an allow-list, never an exception path.
3. **Write stays owner-only** in v1. Read-only sharing keeps `ownerId` meaningful and avoids
   the "whose bookmark is it" question entirely.
4. `POST /collections/:id/share` must itself 404 when `:id` is not yours — otherwise the
   *share* endpoint becomes the existence oracle that the read endpoints carefully are not.
5. The static privacy gate would need a new rule: grant-widened queries are the one legitimate
   exception to "every query filters `ownerId`", so it must recognise the grant predicate
   rather than have `// privacy-ok` sprinkled across the services.

**How the decision is backed.** Not just prose —
`isolation.e2e-spec.ts › there is no route that grants another user access to a collection`
probes `/share`, `/shares`, `/grants` and `/shares` and asserts 404 on each. If someone adds a
sharing endpoint later without revisiting this ADR, that test fails and forces the
conversation. That is the difference between a documented decision and a promise.

**Steering.** This is the decision I most explicitly did *not* delegate. An agent asked to
"resolve §3.3" will build a share table — it is the agreeable answer, and the code is easy.
Deciding not to build something, and defending the boundary, is not a judgement I would trust
an agent to make on my behalf.

---

## ADR-005 — Cross-owner returns **404**, and unknown body fields return **400**

Two related calls about what the API is willing to tell a caller.

**404, never 403.** A 403 says "this exists, but not for you" — which is precisely the
"learn of the existence of" that §3 forbids. Every query is already owner-scoped, so the
database genuinely cannot distinguish "no such row" from "someone else's row", and neither
can the caller. The error *body* is identical too, since a distinctive message would leak
through the body what the status code refuses to. Both are tested
(`no route anywhere answers 403`, and a body-equality assertion).

**400 on unknown fields — a deliberate deviation.** The natural reading of "an `ownerId` in
the body must be ignored" is to strip it silently. I reject with 400 instead
(`forbidNonWhitelisted: true`).

*Why:* a body carrying `ownerId` is either a broken client or a mass-assignment attempt, and
both deserve to be visible. Silently discarding it means an attack looks byte-for-byte
identical to a correct request in the logs. The security property is unchanged either way —
`ownerId` comes from the token in both designs — so I chose the one that is louder.

*Cost:* a client sending a harmless extra field gets a 400 instead of being tolerated.
Acceptable for a first-party API with one consumer; I would reconsider for a public API with
clients I do not control. Tested both as the 400 and as "the row is owned by the authenticated
user regardless".

---

## ADR-006 — Tests mint their own RS256 tokens against a local JWKS

**The problem.** The brief's FAQ asks, pointedly: *"The test user is one account — is that a
problem?"* It is, for the one thing this app most needs to prove. Isolation tests need two
distinct subjects; the tenant gives one login.

**Options considered:**

| Option | Rejected because |
|---|---|
| Mock the guard | Tests the mock. The auth code — the part most likely to be wrong — never runs. |
| A dev-only login bypass | Ships an authentication bypass in the production artefact, gated by a flag someone will misconfigure. Absolutely not, in *this* app. |
| Two real Auth0 accounts | I cannot create them in a tenant I do not administer. |
| **Mint real RS256 JWTs against a JWKS I control** | **Chosen.** |

**Why it is faithful.** The entire production validation path runs unmodified: the same
`TokenVerifierService`, the same `jose` verification, the same signature / `iss` / `aud` /
`exp` / `alg` checks, the same global guard. The guard has no idea it is in a test. The only
substitution is *which host publishes the public key* — one environment variable.

It also buys the negative cases the real tenant will not issue on request: expired,
wrong-audience, wrong-issuer, signed-by-an-unpublished-key, unknown `kid`, and `alg: none`.

**Keeping the real path honest.** `live-jwks.e2e-spec.ts` boots the app against the **real**
tenant — genuine issuer, audience and JWKS URI, no substitutions — and asserts that a
self-minted token is rejected. A guard that skipped signature verification would pass every
other test in the suite and fail this one. It self-skips (loudly) when offline, so a
flight-mode test run does not go red for the wrong reason.

---

## ADR-007 — SQLite, and Prisma 7's driver adapters

**Decision.** SQLite for local dev and tests.

**Why.** Reviewer setup stays one command with no Docker or Postgres prerequisite, and the
brief asks for "SQL persistence via Prisma" without naming an engine. Nothing in the schema
uses an engine-specific feature; switching `provider` to `postgresql` plus a fresh migration
is the whole port.

**Known limitation, stated rather than hidden.** Full-text search uses `contains`, which
compiles to `LIKE` — fine at this scale, and ASCII-case-insensitive on SQLite, but it will not
scale and its case behaviour differs from Postgres, where I would need `mode: 'insensitive'`
or a `tsvector` index. That is a genuine portability wrinkle in the one place the two engines
diverge for this app.

**Prisma 7 forced a decision I did not expect.** v7 removed `url` from the `datasource` block
entirely; the connection now comes from a driver adapter at runtime plus `prisma.config.ts`
for the CLI. My first schema was written the v6 way and was rejected outright. Adopting the v7
shape turned out to be a *benefit* rather than a tax: because the URL is no longer baked into
the schema, the test harness can point each suite at its own SQLite file with an environment
variable, which is what makes the e2e suites independent.

---

## ADR-008 — Frontend uses the Auth0 SDK; PKCE was hand-rolled only to verify the tenant

**Decision.** `@auth0/auth0-react` in the app. A from-scratch PKCE implementation in
`scripts/verify-token.mjs`.

**Why both.** I do not think you can defend an auth design you have only ever consumed through
a library, so the verification script implements Authorization Code + PKCE by hand with
`node:crypto`: generate the verifier, S256 the challenge, catch the callback on a throwaway
listener, exchange the code, decode and compare the tokens. That is how I confirmed what the
tenant issues with and without an audience.

Shipping my own implementation is a different question. State validation, verifier storage,
callback race conditions and refresh handling are all places where a subtle bug is silent and
severe. The SDK is audited; my eighty lines would not be. Understanding the flow is the
requirement — reimplementing it in production is not.

---

## ADR-009 — Ownership is enforced at the data-access layer, and machine-checked

**Decision.** Every service method takes `ownerId` as its first parameter and puts it in the
Prisma `where`. No fetch-then-check in any controller. `findUnique` is banned on owned models.
A static gate (`npm run verify:privacy`) fails the build on violations.

**Why not fetch-then-check.** `const row = await find(id); if (row.ownerId !== me) throw` is
one deleted line from a leak, it is invisible to static analysis, and it has a window between
read and write. Putting `{ id, ownerId }` in the same statement makes the check atomic and
mechanically verifiable.

**Why ban `findUnique`.** It accepts only a unique field, so it *structurally cannot* express
"…and it is mine". Banning it makes the unsafe call impossible rather than merely discouraged
— the strongest form of a rule.

**Steering.** This is the rule I wrote into `CLAUDE.md` first, before any application code
existed, and the reason the `/verify-privacy` gate exists at all. The gate is not there
because I distrust one particular generated file; it is there because the convention has to
survive the *next* agent session, when nobody re-reads this document.
