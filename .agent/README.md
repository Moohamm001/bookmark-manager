# `/.agent/` — reusable agent capabilities

One capability, built because it was needed, used throughout the build: **`/verify-privacy`**.

Everything here is wired into Claude Code under `.claude/` (commands and agents must live
there to be loadable). This directory holds the canonical definitions and, more
importantly, the reasoning: *when* each is invoked and *why* it exists.

---

## `/verify-privacy` — the capability

It has three faces, deliberately, because the same rule needs enforcing at three different
moments:

| Face | Where | When it runs | What it is for |
|---|---|---|---|
| **Static gate** | `.agent/scripts/verify-privacy.ts` | `npm run verify:privacy`, and in CI on every push | Mechanical, fast, zero judgement. Cannot be talked out of a finding. |
| **Slash command** | `.claude/commands/verify-privacy.md` | Manually, after any data-access change | Runs the gate, then reads the diff for what a gate cannot see. |
| **Subagent** | `.claude/agents/privacy-auditor.md` | Before committing anything touching auth or services | Adversarial review with a clean context, so it does not inherit my assumptions. |

### Why it exists

The privacy invariant is enforced by a convention — *every Prisma query touching an owned
model carries `ownerId`*. Conventions rot, and they rot fastest when an agent is writing
the code, because agent output is **plausible**. A `findFirst({ where: { id } })` looks
right, typechecks, passes review at a glance, and passes every test that does not happen
to cover that route.

The e2e suite catches this for routes I thought to test. The gate catches it for the route
someone adds next month and forgets to test — which is precisely where the leak will be.

### What the static gate enforces

1. **Every Prisma call on `Collection` or `Bookmark` has an `ownerId` predicate** — in
   `where` for reads/updates/deletes, in `data` for creates. `User` is exempt: it *is* the
   owner.
2. **`findUnique` / `findUniqueOrThrow` are banned on owned models.** `findUnique` accepts
   only a unique field, so it structurally cannot say "…and it is mine". This is the rule I
   value most, because it makes the unsafe call impossible rather than discouraged.
3. **No `403` anywhere.** `ForbiddenException` and `HttpStatus.FORBIDDEN` are a bug by
   definition here: cross-owner must be indistinguishable from missing.

It resolves `const where = { ownerId, ... }` locals rather than only inspecting inline
object literals — the first version did not, produced four false positives on correct code,
and a gate that cries wolf is a gate that gets switched off.

Suppression is `// privacy-ok: <reason>` on the preceding line. Suppressed lines are
**printed in the summary on every run**, so an ignore list cannot quietly accumulate.
Current count: zero.

### Proof it works

Held to the same standard as the tests — I broke the code and watched it catch:

```
$ npm run verify:privacy       # after swapping findFirst({id,ownerId}) -> findUnique({id})
                               # and dropping ownerId from a create

  FAIL — 2 violation(s):

  backend/src/collections/collections.service.ts:55
    rule   : no-find-unique
    problem: collection.findUnique() cannot express an ownership predicate;
             use findFirst({ where: { id, ownerId } })

  backend/src/collections/collections.service.ts:71
    rule   : unscoped-create
    problem: collection.create() has no ownerId in its data clause
```

Clean run on the committed code:

```
  27 files, 17 Prisma calls on owned models
  PASS — every owned-model query is scoped by ownerId, and no route answers 403.
```

### When I actually invoked it

- After Phase 4 (CRUD), before committing — its first real run.
- After adding `GET /all`, whose nested `include` is the exact shape the gate exists for:
  a nested read that inherits scoping from its parent. It passed only because the nested
  `where` carries `ownerId` explicitly; I added that *because* the gate made me look.
- In CI, as a required step ahead of the tests. It runs in under a second, so it fails a
  bad push before the suite has finished booting.

### What it deliberately does NOT do

It is syntactic, not semantic — no type checking, no cross-file dataflow. It cannot tell
you the `ownerId` you passed is the *right* one (that is what
`test/isolation.e2e-spec.ts` is for). Passing it means "the query is scoped", not "the app
is secure". Both layers are load-bearing and neither replaces the other.

---

## Hook

`.claude/settings.json` registers a `PostToolUse` hook on `Edit`/`Write` so the gate runs
automatically whenever a file under `backend/src/**` changes. The failure lands in the
agent's own context, so it self-corrects in the same turn instead of me catching it at
review time. This is the difference between a gate and a linter nobody runs.
