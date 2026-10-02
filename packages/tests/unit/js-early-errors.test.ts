import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as ts from 'typescript';
import { test } from 'vitest';
import {
  BOTH_MODES_RUNTIME_CODES,
  JS_MODE_RUNTIME_CODES,
} from '../../compiler/src/frontend/program.ts';

/** JavaScript's early errors as the pinned `typescript` classifies them: the binder and grammar
 * groups of `plainJSErrors` in its `program.ts`, the codes `tsc` still reports for a `.js` file
 * without `checkJs`. The set is internal to the package, so it is read out of the shipped bundle
 * and resolved through the (untyped, but exported) `ts.Diagnostics` table. The third group,
 * "Type errors", is a lint (`===` on two object literals) and is not an early error. */
function earlyErrorCodes(): ReadonlyMap<number, string> {
  const bundle = readFileSync(createRequire(import.meta.url).resolve('typescript'), 'utf8');
  const start = bundle.indexOf('var plainJSErrors = ');
  assert.ok(start >= 0, 'typescript no longer declares plainJSErrors: re-derive plan-notes 297');
  const end = bundle.indexOf('// Type errors', start);
  assert.ok(end > start, 'plainJSErrors lost its "Type errors" group: re-derive plan-notes 297');
  const table: unknown = Reflect.get(ts, 'Diagnostics');
  assert.ok(typeof table === 'object' && table !== null, 'ts.Diagnostics is not exported');
  const codes = new Map<number, string>();
  for (const [, name] of bundle.slice(start, end).matchAll(/Diagnostics\.(\w+)\.code/g)) {
    const entry: unknown = name === undefined ? undefined : Reflect.get(table, name);
    assert.ok(
      typeof entry === 'object' && entry !== null && 'code' in entry,
      `ts.Diagnostics.${String(name)} is missing`,
    );
    assert.equal(typeof entry.code, 'number');
    codes.set(Number(entry.code), String(name));
  }
  return codes;
}

test('the pinned typescript still classifies JavaScript early errors', () => {
  const codes = earlyErrorCodes();
  // Spot checks against codes whose meaning the policy depends on: a redeclared `let` and a
  // `with` statement are early errors; a namespace IIFE's function rebinding (2630) and a refused
  // spread (2698) are not.
  assert.ok(codes.has(2451), 'Cannot redeclare block-scoped variable');
  assert.ok(codes.has(1101), "'with' statements are not allowed in strict mode");
  assert.ok(!codes.has(2630));
  assert.ok(!codes.has(2698));
  assert.ok(codes.size > 80, `only ${String(codes.size)} early-error codes parsed`);
});

test('no mode drops a JavaScript early error (plan-notes 297)', () => {
  const codes = earlyErrorCodes();
  for (const code of [...JS_MODE_RUNTIME_CODES, ...BOTH_MODES_RUNTIME_CODES]) {
    assert.ok(
      !codes.has(code),
      `TS${String(code)} (${String(codes.get(code))}) is an early error; it must stay STA0012`,
    );
  }
});
