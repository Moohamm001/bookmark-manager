# AI_WORKFLOW.md

How this was actually built.

---

## Tools and models

| | |
|---|---|
| **Agent** | Claude Code (CLI), model Claude Opus 5 |
| **Mode** | Single long agentic session, tool-using, running commands and reading their output rather than being told what happened |
| **Repo config** | `CLAUDE.md` written **before** any application code; `.agent/` capability added at Phase 1 |
| **Human role** | Set the goal, chose between options the agent put in front of me, ran the app, and reported what broke |

Everything the agent claimed, it ran. The `110 passed` figures, the `FAIL — 2 violation(s)`
output, the Auth0 `Service not found` response — all copied from actual terminal output, not
narrated.

## Division of labour — stated plainly

I would rather be marked down for this than have it discovered at the on-site.

**The agent drove.** It proposed the phase order, wrote `CLAUDE.md`, chose the technical
approach at nearly every step, wrote all the code and all the tests, and did the verification
work below. The engineering judgement in this repo is largely its judgement, not mine.

**What I actually decided.** Two forks, and both were presented to me as options with a
recommendation attached, which I took:

- collection delete → set `collectionId` null rather than cascade (ADR-003)
- §3.3 sharing → document the design, do not build it (ADR-004)
- token storage → keep memory-only after the reload cost became visible in practice (ADR-002)

**What I actually contributed that mattered.** I ran the app. That sounds small next to 110
tests, and it was the single most valuable thing anyone did on this project: **the only
user-facing bug in the build was found by me clicking a button, not by any automated check.**
The agent's typecheck, lint, privacy gate and entire test suite were green while sign-in was
completely broken, because none of them execute a browser redirect. See failure 4.

**Where I did not push back.** When the agent told me `tsx` was silently breaking dependency
injection, I accepted it without independently verifying — it had shown me the stack trace and
the explanation was coherent. There was no point in this build where I thought the agent was
wrong and checked for myself. I am recording that because a workflow log that claims
scepticism I did not exercise is worth less than an honest one, and because it is the clearest
thing I would change next time.

---

## How the work was decomposed

Eight phases, committed separately, in dependency order. The ordering was the main lever: each
phase gave the next one something to be constrained by.

| Phase | Output | Why here |
|---|---|---|
| 0 | Auth0 tenant verification | **Before any code.** The token decision has to come from evidence, not from what an agent assumes |
| 1 | `CLAUDE.md`, `/.agent/` | Rules before code, so they constrain generation rather than describe it afterwards |
| 2 | Prisma schema, migration, two-user seed | The data model is where the invariant is rooted |
| 3 | Global auth guard | Auth before CRUD, so no route ever exists unprotected |
| 4 | CRUD with ownership | — |
| 5 | Verification harness | The largest single block of effort, matching its 20-point weight |
| 6 | Frontend | Last, because it cannot enforce anything |
| 7–8 | Docs, CI, Docker | — |

**The single highest-leverage choice was writing `CLAUDE.md` before Phase 2.** The rules that
went in — 404-not-403, `ownerId` at the data-access layer, identity only from the verified
`sub`, no `any` — showed up in the *first* draft of every service afterwards. I did not have
to correct the same class of mistake repeatedly, which is the usual failure mode of steering
an agent by conversation alone.

---

## What AI did well

**1. Genuinely adversarial test generation, once the frame was set.** Given "each test is one
way the claim could be false" rather than "write tests for auth", the output included cases I
would have got to eventually but not first: `alg: none`, unknown `kid`, an ID-token-shaped
token distinguished only by `aud`, and — the best one — *"does not tell the caller WHY a token
was rejected"*, which asserts that expired, wrong-audience and forged tokens produce byte-identical
bodies. 110 tests in about 9 seconds.

**2. Mechanical breadth without fatigue.** The `PROTECTED_ROUTES` table drives 30 assertions
across every verb and route. A human writes six of those and starts trusting the pattern. This
is the kind of thoroughness worth delegating.

**3. Fast, correct recovery from unfamiliar breaking changes.** Prisma 7 removing `url` from
the datasource, `react-router-dom` having no v8, MUI v9 dropping system props from `Stack`,
jose v6 being ESM-only — four ecosystem changes in one session, each diagnosed from the actual
error and fixed without flailing.

---

## Where AI failed, and how I recovered

Four, in the order they happened. The fourth is the one worth reading.

**1. `tsx` silently broke NestJS dependency injection — and the type checker said nothing.**

The backend was scaffolded with `tsx`. `npx tsc --noEmit` was completely clean. On boot:

```
ERROR [ExceptionHandler] TypeError: Cannot read properties of undefined (reading 'getOrThrow')
    at new TokenVerifierService (src/auth/token-verifier.service.ts:34:26)
```

`tsx` uses esbuild, which does not implement `emitDecoratorMetadata`. Nest resolves constructor
dependencies from exactly that metadata, so every injected service became `undefined`. The
code was right; the *build tool* was wrong, and nothing in the type system can see that.

**Recovery:** build and run through the tsc-based Nest CLI; keep `tsx` only for standalone
scripts with no DI. **The transferable lesson:** a green typecheck is not a green run, and an
agent that stops at "it compiles" will hand you a dead app. Booting the server and curling it
is now a fixed step in the loop, not an afterthought — see "the loop" below.

**2. The privacy gate's first version failed correct code.**

My own tool, agent-written, and its first run produced four confident failures on four correct
queries — it only understood inline object literals, and the services build
`const where = { ownerId, ... }` and pass `{ where }` by shorthand.

**Recovery:** added local-binding resolution rather than suppressing the findings. The reason
given at the time, which I agree with: a security gate that cries wolf gets switched off, or
trains people that `// privacy-ok` is routine. The gate's precision *is* its function.

Worth noting honestly — the agent both wrote this tool and found its flaw. I did not catch it.

**3. I nearly rewrote good tests because a mutation "wasn't caught".**

Verifying the on-delete tests had teeth, I flipped `SetNull` → `Cascade` in `schema.prisma`.
All four tests stayed green. My first instinct was that the tests were weak.

They were fine. `prisma migrate dev` had failed and its output had gone to `/dev/null`, so no
migration was generated and the edit never reached a database.

**Recovery:** mutated the migration SQL instead — where three tests failed immediately and
correctly. **What it taught me about this codebase**, which is the part actually worth having:
the referential action in force lives in the committed migration, not in `schema.prisma`. A
reviewer approving a schema diff here is not looking at what the database will do. That is now
documented in `API_DESIGN.md` §5. **What it taught me about method:** when a mutation is not
caught, first check that the mutation landed.

**4. The login did nothing — a bug that only existed past the point the agent could reach.**

This is the most instructive failure in the build, because of *where* it hid.

The agent could drive the app as far as Auth0's login page and confirm the tenant accepted
the client id, callback URL and audience. It could not type the test password, so the
callback round-trip was never executed. Everything up to that line was verified; the first
thing past it was broken.

I signed in, pressed **Accept**, and landed back at the login screen. No error, no console
noise — sign-in simply did nothing.

**My guess was wrong.** I assumed the API call was malformed — a bad request, or a missing
header. It was neither; nothing had reached the API at all, because the authorization code
never got exchanged. What actually resolved it was reporting the symptom precisely ("press
Accept, nothing happens") rather than my diagnosis of it. That is worth recording: on the one
bug that mattered, my value was as the person who *ran the thing*, not the person who worked
out why.

The cause was four characters of routing:

```tsx
<Route path="/callback" element={<Navigate to="/collections" replace />} />
```

Auth0 returns to `/callback?code=…&state=…`. React runs **child effects before parent
effects**, so `Navigate`'s effect rewrote the URL before `Auth0Provider`'s effect called
`hasAuthParams()` — which reads `window.location.search` at that moment. The SDK saw a clean
URL, never exchanged the authorization code, and left the user unauthenticated; `RequireAuth`
then bounced them back to Auth0. An infinite, silent loop.

The agent's own comment above that line asserted the opposite — *"The SDK consumes the ?code=
and then onRedirectCallback navigates onward"* — which is a good illustration of what
plausible-but-wrong looks like. It reads like someone who understood the flow. Nothing in
typecheck, lint, the 109 tests that existed at that point, or the privacy gate could
see it, because none of them
execute a browser redirect.

**Recovery:** `/callback` now renders a `CallbackPage` that deliberately does nothing to the
URL, and lets `onRedirectCallback` navigate once the code has actually been exchanged.

**Verified without needing the password**, which is the part worth stealing: navigating to
`/callback?code=fake&state=fake` and checking the URL survives and the SDK *attempts* the
exchange —

```
url  : http://localhost:3000/callback?code=fake-code-for-testing&state=fake-state
body : "Sign-in failed / Invalid state / TRY AGAIN"
```

`Invalid state` is the correct rejection of a forged state. Before the fix the params were
stripped and the SDK did nothing at all, so this single check distinguishes the two.

**The transferable lesson.** Know where your agent's verification actually stops, and treat
the first step past that line as unverified by default. The boundary here was "cannot type a
password" — a capability limit, not a knowledge limit — and the bug was sitting immediately
behind it. I should have gone looking there first rather than being told about it.

---

## A prompt that worked, and one that did not

### Worked — framing tests as falsification

> Write automated tests hitting the real Nest app with a test DB. **Each test is one way the
> claim "every route requires a valid Auth0 access token" could be false.** Cover as
> separately named tests a reviewer can read: … Do not write happy-path tests; the happy path
> goes last.

The working part is *"one way the claim could be false"*. Asked to "write tests for
authentication", an agent produces a valid token, a missing token, and a 200 — and reports
good coverage. Reframed as falsification, it produced the wrong-audience case, the
ID-token-shaped case, and the reason-disclosure case unprompted. **The generalisation:** state
the claim you want falsified, not the feature you want covered.

### Did not work — asking for a verification tool without the failure mode

First attempt:

> Write a script that checks all Prisma queries are scoped by ownerId.

What came back was regex over source text. It matched the literal string `ownerId` anywhere in
the file, so a query with `ownerId` in a *comment* passed, and it could not tell a `where` from
a `select`. It reported PASS on code I had deliberately broken — worse than no tool, because it
would have been quoted as evidence.

What worked was specifying the failure mode and the escape hatch:

> Use the TypeScript compiler AST, not regex. For each call `prisma.<model>.<op>()` where model
> is Collection or Bookmark: reads/updates/deletes need `ownerId` inside `where`; creates need
> it inside `data`. **Ban `findUnique` on those models entirely — it cannot express an
> ownership predicate.** Follow `{ where }` shorthand to its local `const`. Allow
> `// privacy-ok: <reason>` and print every suppression in the summary. Exit 1 on any
> violation.

**The generalisation:** for a *verification* tool, the requirement is not what it should
accept — it is what it must not miss. If I cannot state the false-negative I am afraid of, I
am not ready to ask for the tool.

---

## The loop I settled into

Per phase: **specify → generate → run it → break it → commit**.

The two middle steps are the ones that earned their place:

- **Run it.** Not typecheck — run. The server boots and gets curled; the tests execute; the
  frontend is opened in a browser. Failure 1 above is invisible any other way.
- **Break it.** Every guarantee was verified by removing the thing that provides it and
  watching the failure. Three mutations on the test suite
  ([transcript](transcripts/phase-5-mutation-testing.md)); two on the privacy gate. A suite
  that has never failed is an assertion, not evidence — and the point of this exercise is that
  assertions score zero.

---

## Cost and token awareness

The brief puts 10 of 100 points on the app running and 90 on everything else, so the work
skewed heavily toward verification — very roughly 60/40 building to verifying.

These were the agent's calls, and I am recording them because they are the ones that visibly
changed the cost of later phases, not because I made them:

- **`CLAUDE.md` written before any application code.** A few hundred tokens that removed whole
  categories of correction later — 404-not-403, owner-scoping and no-`any` appear in the
  *first* draft of every service, not the second.
- **Phase 0 before any code.** Four `curl` commands produced the token decision, the
  trailing-slash issuer, the two-keys-so-select-by-`kid` finding and the port-3000 constraint.
  All of those are expensive to discover later by debugging a 401 loop.
- **A static gate instead of re-reading diffs.** It runs in under a second in CI and in a
  `PostToolUse` hook. Catching an unscoped query costs nothing; catching it by asking a model
  to re-read a diff costs the whole file, every time.
- **Deliberate non-spend:** no frontend unit tests, no browser E2E, no load testing — all
  listed with reasons in `API_DESIGN.md` §9.

**The one that actually cost real time** was the `tsx` dependency-injection failure, and the
fix was procedural rather than clever: boot the server and hit one route at the end of each
backend phase. It went into the loop afterwards. In hindsight the same lesson covers failure 4
— the app was never *used* until late, and that is where the only real bug was hiding.

---

## What I would do differently

One thing, and it follows directly from the two failures above: **use the app earlier and more
often.** Every automated check the agent built was green while sign-in was broken. Typecheck,
lint, a 109-test suite and a custom static analyser could not see it, because none of them open
a browser.

I would also want to be able to say I had pushed back on the agent somewhere and been right.
I cannot say that about this build — see "Division of labour" above. Knowing *where* an agent
is most likely to be confidently wrong is the skill I am shortest on, and the honest read of
this project is that the tooling caught the agent's mistakes far more often than I did.
