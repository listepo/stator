/* A `not-yet` diagnostic names the phase that owns its BLOCKER, never the phase that happens to be
 * open (plan.md §15). Nothing enforced that, and the cost was not theoretical: Phase 3 completed on
 * 2026-08-30 and SEVENTY gate sites went on telling users their construct was "planned for Phase 3"
 * -- and survived an audit written to end exactly that defect, because the audit asked "which sites
 * name phase 4?" rather than "does any site name a finished phase?" (plan-notes 136).
 *
 * This file asks the general question, four ways, because each catches what the others cannot:
 *
 *   1. SOURCE SCAN. Parse EVERY file under `src/` and read every phase argument, in all three
 *      spellings: the `notYet`/`dateNotYet` helpers, the hand-written `{ kind: 'not-yet', ... }`
 *      literals, and `diagnosticFromNode`'s positional 7th argument. This is the only check that
 *      sees a site no fixture reaches -- and most of the seventy were exactly that. It scans all
 *      of `src/` because the first version scanned only `gate.ts` and promptly missed a Phase 4
 *      pointer in `graph.ts`: one place is never all the places, which is the mistake this whole
 *      task exists to stop repeating.
 *   2. MESSAGE SCAN. A phase number can also be WRITTEN into a message string, where the numeric
 *      field never sees it. plan §7 Task 4.7 step 7 requires both.
 *   3. END TO END. The scans read source; this one compiles a program and reads what a user gets,
 *      so a phase that is correct in the call and lost on the way to the terminal still fails.
 *
 * And it pins COMPLETED_PHASES against `done.md`, so the list cannot drift from the authority. */

import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import ts from 'typescript';
import { gateProgram } from '../../src/frontend/gate.ts';
import { renderDiagnostic } from '../../src/support/diagnostics.ts';
import { COMPLETED_PHASES } from '../../src/support/phases.ts';
import { createProgram } from './helpers.ts';

const SRC_DIR = new URL('../../src/', import.meta.url).pathname;
const DONE_PATH = new URL('../../done.md', import.meta.url).pathname;

/** Every `.ts` file under `src/`. The first version of this test read `gate.ts` alone, and missed
 * a not-yet in `src/frontend/graph.ts` that had named Phase 4 the whole time -- the same
 * one-place-only mistake that let seventy sites survive the audit this test exists to replace
 * (plan-notes 136). The gate is where MOST not-yets live, not where all of them do. */
function sourceFiles(): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.ts')) {
        found.push(full);
      }
    }
  };
  walk(SRC_DIR);
  return found.sort((a, b) => a.localeCompare(b));
}

/** Every phase number the gate can put on a not-yet, with the line that writes it.
 *
 * Two spellings exist and both have to be read: the `notYet(message, phase)` / `dateNotYet(...)`
 * helpers, and the hand-written `{ kind: 'not-yet', ..., phase: N }` literals that carry a
 * dedicated code. A regex over either one misses multi-line calls -- which is how two successive
 * hand counts of this same file came out 2.6x short (plan-notes 130, 136) -- so this parses. */
function phaseSites(): { line: number; phase: number; where: string }[] {
  const found: { line: number; phase: number; where: string }[] = [];
  for (const path of sourceFiles()) {
    collectFrom(path, found);
  }
  return found;
}

function collectFrom(path: string, found: { line: number; phase: number; where: string }[]): void {
  const source = readFileSync(path, 'utf8');
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.ESNext, true);
  const where = relative(SRC_DIR, path);
  const at = (node: ts.Node): number =>
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

  const record = (node: ts.Node, argument: ts.Node | undefined, what: string): void => {
    if (argument === undefined) {
      return; // an omitted phase IS the no-phase sentinel (src/support/phases.ts)
    }
    const phase = Number(argument.getText(sourceFile));
    if (Number.isFinite(phase)) {
      found.push({ line: at(node), phase, where: `${where} (${what})` });
    }
    // A non-literal argument (a table lookup like OBJECT_STATIC_OWNER[m]) cannot be read here;
    // the end-to-end test below is what covers those.
  };

  const walk = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const callee = node.expression.text;
      if (callee === 'notYet' || callee === 'dateNotYet') {
        record(node, node.arguments[1], `${callee}(...)`);
      }
      // `diagnosticFromNode(at, file, code, 'not-yet', mode, message, phase)` and its
      // `diagnosticFromFile` sibling take the phase POSITIONALLY, as the 7th argument -- which is
      // how src/frontend/graph.ts kept a Phase 4 pointer through the first sweep.
      if (
        (callee === 'diagnosticFromNode' || callee === 'diagnosticFromFile') &&
        node.arguments[3]?.getText(sourceFile) === "'not-yet'"
      ) {
        record(node, node.arguments[6], `${callee}(...)`);
      }
    }
    if (ts.isObjectLiteralExpression(node)) {
      const kind = node.properties.find(
        (property) => property.name?.getText(sourceFile) === 'kind',
      );
      const phase = node.properties.find(
        (property) => property.name?.getText(sourceFile) === 'phase',
      );
      if (
        kind !== undefined &&
        ts.isPropertyAssignment(kind) &&
        kind.initializer.getText(sourceFile) === "'not-yet'" &&
        phase !== undefined &&
        ts.isPropertyAssignment(phase)
      ) {
        record(node, phase.initializer, 'not-yet literal');
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(sourceFile);
}

void test('no not-yet under src/ names a completed phase', () => {
  const offenders = phaseSites().filter((site) => COMPLETED_PHASES.includes(site.phase));
  assert.deepEqual(
    offenders,
    [],
    `src/ promises work from a finished phase (plan.md §15). Completed: ${COMPLETED_PHASES.join(', ')}.\n` +
      offenders
        .map((o) => `  ${o.where} line ${String(o.line)} names Phase ${String(o.phase)}`)
        .join('\n'),
  );
});

void test('no not-yet MESSAGE under src/ names a completed phase', () => {
  // The numeric field and the prose can disagree: `notYet` builds the message from its argument,
  // but a hand-written literal spells the phase out, and nothing makes the two agree.
  //
  // This walks the AST rather than the lines. A regex for "a quote somewhere on this line" calls
  // every comment that mentions a finished phase an offender -- and comments SHOULD mention them
  // ("Phase 3 closed on 2026-08-30" is the reason half this file exists). Only text that is
  // actually inside a string or template literal can reach a user.
  const offenders: string[] = [];
  for (const path of sourceFiles()) {
    const source = readFileSync(path, 'utf8');
    const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.ESNext, true);
    const walk = (node: ts.Node): void => {
      if (
        ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node)
      ) {
        for (const match of node.text.matchAll(/Phase (\d+)/g)) {
          if (COMPLETED_PHASES.includes(Number(match[1]))) {
            const line =
              sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
            offenders.push(
              `${relative(SRC_DIR, path)}:${String(line)} literal says "Phase ${String(match[1])}"`,
            );
          }
        }
      }
      ts.forEachChild(node, walk);
    };
    walk(sourceFile);
  }
  assert.deepEqual(offenders, [], offenders.join('\n'));
});

void test('the phase a user actually sees is not a completed one', () => {
  // Source scans read intent. This reads the product: three constructs from three different
  // families, compiled the way `stator build` compiles them, rendered the way the CLI renders them.
  const sources = [
    'function f(...xs: number[]): number { return xs.length; }\nconsole.log(f(1));',
    'const { a } = { a: 1 };\nconsole.log(a);',
    'class C { static { } }\nconsole.log(1);',
  ];
  for (const source of sources) {
    const { program } = createProgram(source, '/test.ts');
    for (const diagnostic of gateProgram(program, 'ts')) {
      if (diagnostic.phase !== undefined) {
        assert.ok(
          !COMPLETED_PHASES.includes(diagnostic.phase),
          `${renderDiagnostic(diagnostic)} — Phase ${String(diagnostic.phase)} is complete`,
        );
      }
      for (const match of renderDiagnostic(diagnostic).matchAll(/Phase (\d+)/g)) {
        assert.ok(
          !COMPLETED_PHASES.includes(Number(match[1])),
          `${renderDiagnostic(diagnostic)} — names a completed phase in its text`,
        );
      }
    }
  }
});

void test('COMPLETED_PHASES matches what done.md records', () => {
  // done.md is the authority; src/support/phases.ts is its machine-readable projection. Marking a
  // phase complete in one and not the other is the drift this pairing exists to prevent.
  const done = readFileSync(DONE_PATH, 'utf8');
  const recorded = [...done.matchAll(/^## Phase (\d+) .*(?:✅ COMPLETE|✅ CLOSED)/gm)].map((m) =>
    Number(m[1]),
  );
  assert.deepEqual(
    [...COMPLETED_PHASES].sort((a, b) => a - b),
    recorded.sort((a, b) => a - b),
    'src/support/phases.ts and done.md disagree about which phases are finished',
  );
});
