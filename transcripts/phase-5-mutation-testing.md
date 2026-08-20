# Phase 5 — proving the test suite actually has teeth

Date: 2026-08-20.

109 passing tests prove nothing on their own. A suite that has never failed might be
asserting the wrong thing, or nothing at all. So before claiming "users cannot see each
other's data, and here are the tests", I broke the code on purpose and checked that the
tests noticed.

Three mutations, one per security mechanism. Each was reverted immediately afterwards.

---

## Mutant 1 — drop the owner scoping from a read

`CollectionsService.findOne`:

```diff
- const collection = await this.prisma.collection.findFirst({ where: { id, ownerId } });
+ const collection = await this.prisma.collection.findFirst({ where: { id } });
```

```
npx jest --config test/jest-e2e.json --runInBand -t "Alice cannot READ Bob rows"

  × GET /collections/:id of Bob -> 404                                    (64 ms)
  √ GET /bookmarks/:id of Bob -> 404                                       (9 ms)
  √ GET /collections/:id/bookmarks of Bob collection -> 404                (7 ms)
  √ GET /bookmarks?collectionId=<Bob> -> 404                               (7 ms)

Tests: 1 failed, 105 skipped, 3 passed, 109 total
```

Caught. Note the precision: exactly the one route I broke failed, and the neighbouring
three still passed. A suite that went all-red here would be telling me much less.

---

## Mutant 2 — remove the cross-tenant collection check

`BookmarksService.assertCollectionUsable`, the check that stops A filing a bookmark into
B's collection:

```diff
  if (collectionId === null || collectionId === undefined) return;
- await this.collections.assertOwned(ownerId, collectionId);
+ return; // MUTANT
```

```
npx jest --config test/jest-e2e.json --runInBand -t "cross-tenant writes"

  × Alice cannot CREATE a bookmark inside Bob collection -> 404          (108 ms)
  × Alice cannot MOVE her bookmark into Bob collection with PUT -> 404    (20 ms)
  × Alice cannot MOVE her bookmark into Bob collection with PATCH -> 404  (25 ms)
  × Bob collection still contains exactly his own bookmarks                (5 ms)

Tests: 4 failed, 105 skipped, 109 total
```

Caught on all three verbs — which is the point of testing create, PUT and PATCH separately
rather than trusting that one implies the others.

The fourth failure matters most: `Bob collection still contains exactly his own bookmarks`
reads the database directly. Without it, the suite would be asserting only that the API
*said* 404. This one asserts that nothing was actually written into Bob's collection.

---

## Mutant 3 — flip the on-delete rule

First attempt was a **false negative, and finding out why was the useful part.** I edited
`schema.prisma` from `onDelete: SetNull` to `onDelete: Cascade` and re-ran:

```
  √ deleting a collection leaves its bookmarks alive and uncategorised   (226 ms)
  √ the survivors are reachable through the API as uncategorised         (108 ms)
  √ the constraint is enforced by the DATABASE, not just by application code (61 ms)
Tests: 4 passed, 4 total
```

All green — the tests "failed to catch" the mutation. But they were right and I was wrong:
`prisma migrate dev` had not actually produced a migration (it exited non-zero and I had
sent its output to /dev/null), so the schema edit never reached any database. Checking
`prisma/migrations/` showed only the original `init`, still containing `ON DELETE SET NULL`.

**The lesson is a real one about this codebase:** the referential action lives in the
committed migration SQL, not in `schema.prisma` at runtime. Editing the schema without
generating a migration changes nothing at all. Anyone reviewing a schema diff for this
project has to look at the migration to know what the database will actually do.

So I mutated the thing that is actually in force — the migration SQL:

```diff
- CONSTRAINT "Bookmark_collectionId_fkey" FOREIGN KEY ("collectionId")
-   REFERENCES "Collection" ("id") ON DELETE SET NULL ON UPDATE CASCADE
+ CONSTRAINT "Bookmark_collectionId_fkey" FOREIGN KEY ("collectionId")
+   REFERENCES "Collection" ("id") ON DELETE CASCADE ON UPDATE CASCADE
```

```
npx jest --config test/jest-e2e.json --runInBand test/on-delete

  × deleting a collection leaves its bookmarks alive and uncategorised   (390 ms)
  × the survivors are reachable through the API as uncategorised          (85 ms)
  × the constraint is enforced by the DATABASE, not just by application code (27 ms)
  √ deleting a USER does cascade — their rows go with them                (41 ms)

Tests: 3 failed, 1 passed, 4 total
```

Caught. And the one that stayed green is the right one: user-delete *should* cascade, and
it still does. The suite distinguishes the two referential actions rather than asserting
"deletes work".

---

## After reverting all three

```
Test Suites: 5 passed, 5 total
Tests:       109 passed, 109 total
Time:        ~9 s
```

## What this exercise changed

- I now trust the isolation tests, because I have seen them fail for the right reason.
- It surfaced the schema-vs-migration gap in mutant 3, which is a genuine review hazard on
  this project and is now written down in `API_DESIGN.md`.
- It is the reason `test/isolation.e2e-spec.ts` asserts against `ctx.prisma` after a
  rejected write, rather than trusting the status code. Mutant 2 is what made that
  necessary — a handler that 404s *after* writing would have passed the status-only version.
