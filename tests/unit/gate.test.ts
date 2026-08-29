/* The frontend gate (src/frontend/gate.ts) had no direct unit tests before this file — every case
 * was reached only indirectly, through `explain`/`build` in the decision-test corpus. That leaves
 * exactly the kind of rule this gate depends on unverified in isolation: a POSITION test, not a
 * syntax test, which a decision test exercises only by accident of what example it happens to use.
 *
 * `gateProgram` takes a real `ts.Program`; `program()` below builds one exactly the way
 * `stator explain`/`build` would, so a passing test here is a claim about the actual gate. */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { gateProgram } from '../../src/frontend/gate.ts';
import { createProgram } from './helpers.ts';

function codesFor(source: string, mode: 'ts' | 'js' = 'ts', fileName?: string): string[] {
  const { program } = createProgram(source, fileName ?? (mode === 'js' ? '/test.js' : '/test.ts'));
  return gateProgram(program, mode).map((d) => d.code);
}

// `x++`, `--x`, `x += e` all read-then-write-then-produce-a-value. Where the value is used they
// need a temporary the fold cannot give them (plan-notes 43); where it is discarded they collapse
// to a plain Assignment. The gate is the layer that decides which case a program is in.
void test('++ and -- are accepted where their value is discarded', () => {
  assert.deepEqual(codesFor('let x: number = 0;\nx++;'), []);
  assert.deepEqual(codesFor('let x: number = 0;\n--x;'), []);
  assert.deepEqual(codesFor('for (let i: number = 0; i < 1; i++) { }'), []);
});

void test('++ and -- are refused where their value is USED', () => {
  // Both read the value `x` had (postfix) or has (prefix) and bind it — exactly the shape the HIR
  // has no node for. A silent accept here would reach the lowering with nothing to lower it to.
  assert.deepEqual(codesFor('let x: number = 0;\nlet y: number = x++;'), ['STA1214']);
  assert.deepEqual(codesFor('let x: number = 0;\nlet y: number = --x;'), ['STA1214']);
});

void test('compound assignment is accepted where its value is discarded, refused where used', () => {
  assert.deepEqual(codesFor('let x: number = 0;\nx += 1;'), []);
  assert.deepEqual(codesFor('for (let i: number = 0; i < 1; i += 1) { }'), []);
  assert.deepEqual(codesFor('let x: number = 0;\nlet y: number = (x += 1);'), ['STA1214']);
});

void test('compound assignment to anything but a bare identifier is deferred, not accepted', () => {
  // No object model exists yet for the target to reach the fold soundly, so `.length` — the one
  // property this subset already exposes — has to be refused rather than silently miscompiled.
  assert.deepEqual(codesFor('let s: string = "x";\ns.length += 1;'), ['STA1214']);
});

// A label exists only to be named by `break`/`continue`, and only a loop or a switch is modelled
// with somewhere to put one (docs/HIR.md). `foo: { }` is legal JavaScript with nothing to bind to.
void test('a label on a loop or switch is accepted; a label on anything else is deferred', () => {
  assert.deepEqual(codesFor('outer: while (false) { break outer; }'), []);
  assert.deepEqual(codesFor('let x: number = 0;\nouter: switch (x) { }'), []);
  assert.deepEqual(codesFor('outer: { }'), ['STA1214']);
});

// `for`, `for-of`, `for-in` all parse as loops, but they are three different things and their
// diagnostics have to say so. Conflating them ("for loops is not yet supported") would misname
// what is actually missing (plan-notes 44). for-of over an ARRAY landed with rung 5; for-of over
// anything else is the iterator protocol, and for-in needs the object model.
void test('for-of and for-in report distinctly from the for loop they are not', () => {
  assert.deepEqual(codesFor('for (const x of [1, 2]) { }'), []);
  assert.deepEqual(codesFor("for (const c of 'ab') { }"), ['STA1214']);
  assert.deepEqual(codesFor('for (const x in {}) { }'), ['STA1214']);
  assert.deepEqual(codesFor('for (let i: number = 0; i < 1; i++) { }'), []);
});

// Index access is admitted only where the target is genuinely an array. `s[0]` and `o['k']` are
// the same syntax reaching a different runtime operation, and neither has an HIR node yet.
void test('index access is accepted on an array and not-yet on anything else', () => {
  assert.deepEqual(codesFor('const a: number[] = [1];\nconsole.log(a[0]);'), []);
  assert.deepEqual(codesFor("const s: string = 'ab';\nconsole.log(s[0]);"), ['STA1214']);
  // A hole and a spread are rejected in their own right: a dense array cannot be absent, and a
  // spread needs the iterator protocol.
  assert.deepEqual(codesFor('const a: number[] = [1, , 3];'), ['STA1214']);
  assert.deepEqual(codesFor('const a: number[] = [1];\nconst b: number[] = [...a];'), ['STA1214']);
});

void test('switch, case, default and do/while are all accepted syntax', () => {
  assert.deepEqual(
    codesFor('let x: number = 0;\nswitch (x) { case 1: break; default: break; }'),
    [],
  );
  assert.deepEqual(codesFor('let x: number = 0;\ndo { x++; } while (x < 1);'), []);
});

// `var` is banned in ts mode BY DESIGN (STA1104, a 'never' code, no phase) — hoisting with a TDZ
// is the dynamic-scoping behaviour strict mode exists to exclude. In js mode it is merely not
// implemented yet, which is a different class of diagnostic entirely (docs/DIAGNOSTICS.md).
void test('var is a permanent rejection in ts mode, but only "not yet" in js mode', () => {
  assert.deepEqual(codesFor('var x = 1;'), ['STA1104']);
  assert.deepEqual(codesFor('var x = 1;', 'js'), ['STA1214']);
});

// The HIR's Declaration always carries exactly one name and one initializer (docs/HIR.md) — both
// of these parse as valid TypeScript but have no HIR shape to lower into yet.
void test('a declaration missing an initializer, or destructuring one, are both deferred', () => {
  assert.deepEqual(codesFor('let x: number;'), ['STA1214']);
  assert.deepEqual(codesFor('let [a, b]: [number, number] = [1, 2];'), ['STA1214']);
});

// Mirrors the compound-assignment-to-non-identifier test above, but for plain `=`: HIR Assignment
// only ever targets a bare name, so `obj.x = 1` needs an object model this subset doesn't have.
void test('plain assignment to anything but a bare identifier is deferred, not accepted', () => {
  assert.deepEqual(codesFor('let s: string = "x";\ns.length = 2;'), ['STA1214']);
});

// Loose equality is accepted alongside strict equality (docs/NUMERIC.md §6.3): its ToPrimitive
// half is unreachable while every value is a primitive, so it needs no object model to be sound.
void test('loose equality (== and !=) is accepted, not deferred pending an object model', () => {
  assert.deepEqual(codesFor('let x: number = 1;\nconsole.log(x == 1);'), []);
  assert.deepEqual(codesFor('let x: number = 1;\nconsole.log(x != 2);'), []);
});

// `.length` is the one gate rule that consults the type checker instead of syntax alone: the same
// PropertyAccessExpression is legal on a string and meaningless on anything else, so only the
// checker's answer -- not the shape of the code -- can tell the two apart.
void test('.length is accepted on a string type and deferred on anything else', () => {
  assert.deepEqual(codesFor('let s: string = "hi";\nconsole.log(s.length);'), []);
  assert.deepEqual(codesFor('let b: boolean = true;\nconsole.log(b.length);'), ['STA1214']);
});

// A global the compiler does not model is the case where the gate accepting too much cost the
// COMPILER its own invariant rather than the user a feature: the lowering binds only declarations
// it lowers, so an accepted `String` reached `STA4035 used before declaration` — an internal error
// raised by legal source. These tests are position tests, and every one of them once passed the
// gate (plan-notes 61).
void test('a global the compiler does not model is a not-yet, never an internal error', () => {
  assert.deepEqual(codesFor('const s: string = String(1);\nconsole.log(s);'), ['STA1214']);
  assert.deepEqual(codesFor('console.log(parseInt("4"));'), ['STA1214']);
  // Declared nowhere at all rather than in a lib file — the checker synthesizes these two, and
  // `globalThis` slipped through a valueDeclaration-based test while `NaN` did not.
  assert.deepEqual(codesFor('const g = globalThis;\nconsole.log(1);'), ['STA1214']);
  assert.deepEqual(codesFor('console.log(NaN);'), ['STA1214']);
});

void test('the three spellings that only MENTION a global name still pass', () => {
  // `undefined` is the one global with a lowering: it answers with an undefined-literal, and the
  // gate exempts it by name so both sides agree on the same single exception.
  assert.deepEqual(codesFor('const u = undefined;\nconsole.log(u);'), []);
  // A property NAME is answered by the object's shape, never by scope; that `length` resolves to a
  // lib declaration is an accident of where the type came from.
  assert.deepEqual(codesFor('const s: string = "ab";\nconsole.log(s.length);'), []);
  assert.deepEqual(codesFor('console.log([1, 2].length);'), []);
  // `console` is the receiver of the one call the compiler models itself. gateCall vets the whole
  // expression; the walker descends into the callee anyway.
  assert.deepEqual(codesFor('console.log(1);'), []);
  // A type position erases, so there is nothing to lower.
  assert.deepEqual(codesFor('const xs: Array<number> = [1];\nconsole.log(xs.length);'), []);
});

void test('a user binding that shadows a global name is a user binding', () => {
  // The rule is "declared nowhere in the module", not "spelled like a global": the check is over
  // where the symbol's declarations LIVE, so a name declared in user code stays a normal binding
  // even when a lib global answers to it too.
  assert.deepEqual(
    codesFor(
      'function f(): number {\n  const String: number = 1;\n  return String;\n}\nconsole.log(f());',
    ),
    [],
  );
});
