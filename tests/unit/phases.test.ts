/* A `not-yet` diagnostic names the phase that owns its BLOCKER, never the phase that happens to be
 * open (plan.md §15). Nothing enforced that, and the cost was not theoretical: Phase 3 completed on
 * 2026-08-30 and SEVENTY gate sites went on telling users their construct was "planned for Phase 3"
 * -- and survived an audit written to end exactly that defect, because the audit asked "which sites
 * name phase 4?" rather than "does any site name a finished phase?" (plan-notes 136).
 *
 * This file asks the general question, three ways, because each catches what the others cannot:
 *
 *   1. SOURCE SCAN. Parse `gate.ts` and read every phase argument. This is the only check that
 *      sees a site no fixture reaches -- and most of the seventy were exactly that.
 *   2. MESSAGE SCAN. A phase number can also be WRITTEN into a message string, where the numeric
 *      field never sees it. plan §7 Task 4.7 step 7 requires both.
 *   3. END TO END. The scans read source; this one compiles a program and reads what a user gets,
 *      so a phase that is correct in the call and lost on the way to the terminal still fails.
 *
 * And it pins COMPLETED_PHASES against `done.md`, so the list cannot drift from the authority. */

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { gateProgram } from '../../src/frontend/gate.ts';
import { renderDiagnostic } from '../../src/support/diagnostics.ts';
import { COMPLETED_PHASES } from '../../src/support/phases.ts';
import { createProgram } from './helpers.ts';

const GATE_PATH = new URL('../../src/frontend/gate.ts', import.meta.url).pathname;
const DONE_PATH = new URL('../../done.md', import.meta.url).pathname;

/** Every phase number the gate can put on a not-yet, with the line that writes it.
 *
 * Two spellings exist and both have to be read: the `notYet(message, phase)` / `dateNotYet(...)`
 * helpers, and the hand-written `{ kind: 'not-yet', ..., phase: N }` literals that carry a
 * dedicated code. A regex over either one misses multi-line calls -- which is how two successive
 * hand counts of this same file came out 2.6x short (plan-notes 130, 136) -- so this parses. */
function phaseSites(): { line: number; phase: number; where: string }[] {
  const source = readFileSync(GATE_PATH, 'utf8');
  const sourceFile = ts.createSourceFile(GATE_PATH, source, ts.ScriptTarget.ESNext, true);
  const found: { line: number; phase: number; where: string }[] = [];
  const at = (node: ts.Node): number =>
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

  const record = (node: ts.Node, argument: ts.Node | undefined, where: string): void => {
    if (argument === undefined) {
      return; // an omitted phase IS the no-phase sentinel (src/support/phases.ts)
    }
    const phase = Number(argument.getText(sourceFile));
    if (Number.isFinite(phase)) {
      found.push({ line: at(node), phase, where });
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
  return found;
}

void test('no not-yet in the gate names a completed phase', () => {
  const offenders = phaseSites().filter((site) => COMPLETED_PHASES.includes(site.phase));
  assert.deepEqual(
    offenders,
    [],
    `gate.ts promises work from a finished phase (plan.md §15). Completed: ${COMPLETED_PHASES.join(', ')}.\n` +
      offenders
        .map((o) => `  gate.ts:${String(o.line)} ${o.where} names Phase ${String(o.phase)}`)
        .join('\n'),
  );
});

void test('no not-yet MESSAGE names a completed phase', () => {
  // The numeric field and the prose can disagree: `notYet` builds the message from the argument,
  // but a hand-written literal spells the phase out, and nothing makes the two agree.
  const source = readFileSync(GATE_PATH, 'utf8');
  const lines = source.split('\n');
  const offenders: string[] = [];
  for (const [index, line] of lines.entries()) {
    for (const match of line.matchAll(/Phase (\d+)/g)) {
      const phase = Number(match[1]);
      // A comment may legitimately discuss a finished phase ("Phase 3 closed on 2026-08-30").
      // Only a STRING LITERAL reaches a user.
      const inString = /['"`][^'"`]*Phase \d+/.test(line);
      if (COMPLETED_PHASES.includes(phase) && inString) {
        offenders.push(`gate.ts:${String(index + 1)} ${line.trim()}`);
      }
    }
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
