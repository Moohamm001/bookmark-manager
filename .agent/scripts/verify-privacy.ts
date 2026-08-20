#!/usr/bin/env tsx
/**
 * verify-privacy — a static gate for the one invariant this app cannot get wrong.
 *
 *   npm run verify:privacy
 *
 * WHY THIS EXISTS
 *
 * The privacy invariant is enforced by a convention: every Prisma query touching an
 * owned model carries `ownerId`. Conventions decay — especially when an agent is writing
 * the code, because an agent will happily produce a `findFirst({ where: { id } })` that
 * looks right, typechecks, and passes every test that does not happen to cover that route.
 *
 * The e2e suite catches this only for routes it knows about. This catches it for routes
 * nobody has written a test for yet, which is exactly where the leak will be.
 *
 * WHAT IT CHECKS
 *
 *   1. Every Prisma call on an owned model (Collection, Bookmark) has an `ownerId`
 *      predicate — in `where` for reads/updates/deletes, in `data` for creates.
 *   2. `findUnique` / `findUniqueOrThrow` are BANNED on owned models. `findUnique` takes
 *      only a unique field, so it cannot express "...and it is mine". Use `findFirst`.
 *   3. No 403 anywhere in the API surface. Cross-owner must be indistinguishable from
 *      missing, so `ForbiddenException` / `HttpStatus.FORBIDDEN` are a bug by definition.
 *
 * ESCAPE HATCH
 *
 * A line preceded by `// privacy-ok: <reason>` is allowed through, and every use is
 * PRINTED in the summary. Suppressions are meant to be visible and few — an ignore list
 * nobody can see is how a gate stops meaning anything.
 *
 * Exit code 0 = clean, 1 = violations found.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCAN_ROOTS = [path.join(REPO_ROOT, 'backend', 'src')];

/** Models whose rows belong to a user. `User` itself is the owner, so it is exempt. */
const OWNED_MODELS = new Set(['collection', 'bookmark']);

const READ_OPS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);
const WRITE_OPS = new Set(['update', 'updateMany', 'delete', 'deleteMany', 'upsert']);
const CREATE_OPS = new Set(['create', 'createMany', 'createManyAndReturn']);
const BANNED_OPS = new Set(['findUnique', 'findUniqueOrThrow']);
const ALL_OPS = new Set([...READ_OPS, ...WRITE_OPS, ...CREATE_OPS, ...BANNED_OPS]);

const EXCLUDED_DIRS = new Set(['generated', 'node_modules', 'dist']);
const SUPPRESSION = /\/\/\s*privacy-ok:\s*(.+)/;

interface Finding {
  file: string;
  line: number;
  rule: string;
  detail: string;
  snippet: string;
}

const violations: Finding[] = [];
const suppressions: Finding[] = [];
let callsChecked = 0;

function collectFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry)) collectFiles(full, acc);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts') && !entry.endsWith('.spec.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

/**
 * Resolve a `where` that was built into a local variable first — the common shape:
 *
 *   const where = { ownerId, ...filters };
 *   this.prisma.bookmark.findMany({ where });
 *
 * Without this the gate produces false positives on perfectly correct code, and a gate
 * that cries wolf gets switched off. File-scoped lookup by name is deliberately simple:
 * if two different `where` consts in one file disagree, this errs toward flagging.
 */
function resolveLocalBinding(name: string, sf: ts.SourceFile): ts.Node | undefined {
  let resolved: ts.Node | undefined;
  const walk = (n: ts.Node): void => {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === name &&
      n.initializer
    ) {
      resolved ??= n.initializer;
    }
    ts.forEachChild(n, walk);
  };
  walk(sf);
  return resolved;
}

/** Recursively look for a property named `ownerId` anywhere inside an object literal. */
function containsOwnerId(node: ts.Node): boolean {
  let found = false;
  const walk = (n: ts.Node): void => {
    if (found) return;
    if (
      (ts.isPropertyAssignment(n) || ts.isShorthandPropertyAssignment(n)) &&
      n.name &&
      ts.isIdentifier(n.name) &&
      n.name.text === 'ownerId'
    ) {
      found = true;
      return;
    }
    ts.forEachChild(n, walk);
  };
  walk(node);
  return found;
}

function getProperty(obj: ts.ObjectLiteralExpression, name: string): ts.Node | undefined {
  for (const prop of obj.properties) {
    if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.text === name) {
      return prop.initializer;
    }
    if (ts.isShorthandPropertyAssignment(prop) && prop.name.text === name) {
      return prop.name;
    }
  }
  return undefined;
}

function analyse(file: string): void {
  const source = readFileSync(file, 'utf8');
  const lines = source.split(/\r?\n/);
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.ES2023, true);
  const rel = path.relative(REPO_ROOT, file).replace(/\\/g, '/');

  const lineOf = (node: ts.Node): number =>
    sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

  const suppressedAt = (line: number): string | null => {
    for (const candidate of [lines[line - 2], lines[line - 1]]) {
      const m = candidate?.match(SUPPRESSION);
      if (m) return m[1].trim();
    }
    return null;
  };

  const report = (node: ts.Node, rule: string, detail: string): void => {
    const line = lineOf(node);
    const finding: Finding = {
      file: rel,
      line,
      rule,
      detail,
      snippet: (lines[line - 1] ?? '').trim().slice(0, 100),
    };
    const reason = suppressedAt(line);
    if (reason) suppressions.push({ ...finding, detail: `${detail} — suppressed: ${reason}` });
    else violations.push(finding);
  };

  const visit = (node: ts.Node): void => {
    // Rule 3: no 403 anywhere.
    if (ts.isIdentifier(node) && node.text === 'ForbiddenException') {
      report(node, 'no-403', 'ForbiddenException leaks that a resource exists; use 404');
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'FORBIDDEN'
    ) {
      report(node, 'no-403', 'HttpStatus.FORBIDDEN leaks existence; use NOT_FOUND');
    }

    // Rules 1 and 2: Prisma calls on owned models.
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const opName = node.expression.name.text;
      const receiver = node.expression.expression;

      if (ALL_OPS.has(opName) && ts.isPropertyAccessExpression(receiver)) {
        const model = receiver.name.text.toLowerCase();

        if (OWNED_MODELS.has(model)) {
          callsChecked++;

          if (BANNED_OPS.has(opName)) {
            report(
              node,
              'no-find-unique',
              `${model}.${opName}() cannot express an ownership predicate; use findFirst({ where: { id, ownerId } })`,
            );
          } else {
            const arg = node.arguments[0];
            if (!arg || !ts.isObjectLiteralExpression(arg)) {
              report(
                node,
                'unscoped-query',
                `${model}.${opName}() called without an inspectable literal argument`,
              );
            } else {
              const key = CREATE_OPS.has(opName) ? 'data' : 'where';
              let clause = getProperty(arg, key);

              // `{ where }` shorthand, or `{ where: someLocal }` — follow it.
              if (clause && ts.isIdentifier(clause)) {
                clause = resolveLocalBinding(clause.text, sf) ?? clause;
              }

              if (!clause || !containsOwnerId(clause)) {
                report(
                  node,
                  CREATE_OPS.has(opName) ? 'unscoped-create' : 'unscoped-query',
                  `${model}.${opName}() has no ownerId in its ${key} clause`,
                );
              }
            }
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sf);
}

// ---------------------------------------------------------------------------

const files = SCAN_ROOTS.flatMap((root) => collectFiles(root));
files.forEach(analyse);

const bold = (s: string) => `[1m${s}[0m`;
const red = (s: string) => `[31m${s}[0m`;
const green = (s: string) => `[32m${s}[0m`;
const yellow = (s: string) => `[33m${s}[0m`;
const dim = (s: string) => `[2m${s}[0m`;

console.log(bold('\nverify-privacy'));
console.log(dim(`  ${files.length} files, ${callsChecked} Prisma calls on owned models\n`));

if (suppressions.length > 0) {
  console.log(yellow(`  ${suppressions.length} suppressed:`));
  for (const s of suppressions) {
    console.log(yellow(`    ${s.file}:${s.line}  [${s.rule}] ${s.detail}`));
  }
  console.log();
}

if (violations.length === 0) {
  console.log(green('  PASS — every owned-model query is scoped by ownerId, and no route answers 403.\n'));
  process.exit(0);
}

console.log(red(bold(`  FAIL — ${violations.length} violation(s):\n`)));
for (const v of violations) {
  console.log(red(`  ${v.file}:${v.line}`));
  console.log(`    rule   : ${v.rule}`);
  console.log(`    problem: ${v.detail}`);
  console.log(dim(`    code   : ${v.snippet}`));
  console.log();
}
console.log(
  dim(
    '  Fix the query, do not suppress it. If a suppression is genuinely correct, add\n' +
      '  `// privacy-ok: <reason>` on the line above and say why in the PR.\n',
  ),
);
process.exit(1);
