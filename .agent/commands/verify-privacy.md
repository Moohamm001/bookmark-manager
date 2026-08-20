---
description: Audit the working tree for any data-access path that is not scoped to the authenticated owner
---

Run the privacy audit for this repo. Two passes — the mechanical one first, because it is
fast and cannot be argued with.

## Pass 1 — the static gate

```bash
npm run verify:privacy
```

If it fails: **fix the query, do not suppress it.** A `// privacy-ok:` comment is only
acceptable when the query genuinely must be unscoped, and you must say why in your summary.

## Pass 2 — what a static gate cannot see

Read the changed files (`git diff HEAD`) and check the things that need judgement:

1. **Every Prisma query, listed explicitly.** For each one state: the model, the operation,
   and the exact ownership predicate. If you cannot point at the predicate, it is a finding.
2. **Where did `ownerId` come from?** It must trace back to `@CurrentUser()` / the verified
   token `sub`. If it came from a request body, query param, header, or a DTO field, that
   is a critical finding regardless of what the gate said.
3. **Cross-owner responses.** Any new path that can 403, or that returns a distinguishable
   error/empty-list for "someone else's row" vs "no such row"? An empty `200` where a `404`
   belongs is a leak the gate cannot detect — it is a valid, scoped query.
4. **Nested reads.** Any `include` / `select` that pulls a relation. Does the nested query
   carry its own `ownerId`, or is it trusting the parent?
5. **New routes.** Is the route covered by the global `APP_GUARD`? Did anything acquire
   `@Public()`? A new `@Public()` route is a finding unless it returns a constant.
6. **Test coverage.** Does `test/isolation.e2e-spec.ts` cover the new path with the
   A-cannot-reach-B case? An untested data-access path is an unverified claim.

## Output

- Findings first, most severe first, each with `file:line` and the concrete request that
  would exploit it. No finding is fine — say so plainly.
- Then the list from step 1, so I can check your reading against the code myself.
- Do not fix anything unless I ask. I want to see the findings before the diff.
