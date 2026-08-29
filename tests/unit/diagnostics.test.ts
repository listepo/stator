/* src/support/diagnostics.ts had no direct unit tests before this file — every diagnostic reached
 * assertions only through whatever construct happened to trigger it in the gate/verifier/lowering
 * suites. Two things live entirely in this module and are invisible from there:
 *
 * 1. Line/column conversion (ts.Node positions are 0-indexed; docs/DIAGNOSTICS.md's schema is
 *    1-indexed) — an off-by-one here would misreport every diagnostic's location and nothing
 *    downstream would notice, since callers just forward whatever comes back.
 * 2. The `phase` field's presence rule: "present only when class is 'not-yet', omitted (never
 *    null) otherwise" is a promise in the schema, not something TypeScript's structural typing
 *    enforces on its own — passing a `phase` alongside class 'error' has to be silently dropped,
 *    not carried through as `undefined` (exactOptionalPropertyTypes distinguishes the two). */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  diagnosticFromFile,
  diagnosticFromNode,
  renderDiagnostic,
} from '../../src/support/diagnostics.ts';
import { createProgram } from './helpers.ts';

void test('diagnosticFromNode converts 0-indexed ts positions to 1-indexed line/column', () => {
  const { sourceFile } = createProgram(
    'let a: number = 1;\nlet b: number = 2;\n  let c: number = 3;',
  );
  const third = sourceFile.statements[2];
  assert.ok(third);

  const d = diagnosticFromNode(third, sourceFile, 'STA9999', 'error', 'ts', 'test');
  assert.equal(d.line, 3);
  assert.equal(d.column, 3); // two leading spaces before `let c`
});

void test('phase is present only for a not-yet diagnostic, never for any other class', () => {
  const { sourceFile } = createProgram('let a: number = 1;');
  const stmt = sourceFile.statements[0];
  assert.ok(stmt);

  const notYet = diagnosticFromNode(stmt, sourceFile, 'STA1214', 'not-yet', 'ts', 'msg', 3);
  assert.equal(notYet.phase, 3);

  // Passing a phase alongside a class that isn't 'not-yet' must not leak it through — the field
  // is absent, not `undefined`, which exactOptionalPropertyTypes treats as materially different.
  const error = diagnosticFromNode(stmt, sourceFile, 'STA1001', 'error', 'ts', 'msg', 3);
  assert.equal('phase' in error, false);

  // 'not-yet' with no phase given also omits the field, rather than writing `phase: undefined`.
  const noPhase = diagnosticFromNode(stmt, sourceFile, 'STA1214', 'not-yet', 'ts', 'msg');
  assert.equal('phase' in noPhase, false);
});

void test('diagnosticFromFile defaults to a zero-length span at the origin when none is given', () => {
  const d = diagnosticFromFile('/x.ts', 5, 1, 'STA0001', 'error', 'ts', 'missing file');
  assert.deepEqual(d.span, { start: 0, length: 0 });
});

void test('diagnosticFromFile applies the same phase-presence rule as diagnosticFromNode', () => {
  const withPhase = diagnosticFromFile(
    '/x.ts',
    1,
    1,
    'STA1214',
    'not-yet',
    'js',
    'msg',
    undefined,
    5,
  );
  assert.equal(withPhase.phase, 5);

  const wrongClass = diagnosticFromFile(
    '/x.ts',
    1,
    1,
    'STA4001',
    'internal',
    'js',
    'msg',
    undefined,
    5,
  );
  assert.equal('phase' in wrongClass, false);
});

void test('renderDiagnostic formats as file:line:col CODE [mode] message', () => {
  const d = diagnosticFromFile('/x.ts', 4, 7, 'STA1001', 'error', 'ts', "'any' is a compile error");
  assert.equal(renderDiagnostic(d), "/x.ts:4:7 STA1001 [ts] 'any' is a compile error");
});
