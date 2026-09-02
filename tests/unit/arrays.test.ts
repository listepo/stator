/* Array lowering — and in particular the one part of it the CLI cannot reach yet.
 *
 * `a[i] += 1` and `a[i]++` are read-modify-write on a target that can have side effects, so the
 * target and index must be evaluated ONCE and reused for both halves. Rung 3 folded `x += e` to
 * `x = x + e`, which is only sound for a bare identifier, and promised the general rule would be
 * written when index access arrived (plan-notes 43). It now is — but `noUncheckedIndexedAccess`
 * makes `a[i] += 1` a TypeScript error until Task 3.5 inserts the narrowing check, so no golden or
 * decision test can exercise it (plan-notes 53). These tests do, at the level below the gate, so
 * the rule is pinned rather than trusted.
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { Block, Declaration, IndexAssignment, Statement } from '../../src/hir/nodes.ts';
import { lowerSource, requireInit } from './helpers.ts';

function statements(code: string): readonly Statement[] {
  const { module, diagnostics } = lowerSource(code);
  assert.deepEqual(
    diagnostics.map((d) => d.code),
    [],
    'lowering should be clean',
  );
  return module.statements;
}

/** The read-modify-write forms lower to a Block: the hoisted temporaries are declarations that must
 * scope to the assignment and not leak into the surrounding statement list. */
function readModifyWrite(code: string): {
  temps: readonly Declaration[];
  write: IndexAssignment;
} {
  // The last statement: these sources declare the side-effecting helpers first.
  const stmt = statements(code).at(-1);
  assert.equal(stmt?.kind, 'block', 'a hoisting compound assignment lowers to a block');
  const block = stmt as Block;
  const write = block.statements.at(-1);
  assert.equal(write?.kind, 'index-assignment');
  return {
    temps: block.statements.slice(0, -1) as Declaration[],
    write: write as IndexAssignment,
  };
}

test('plain index assignment lowers with no temporaries', () => {
  const write = statements('const a: number[] = [1]; const i: number = 0; a[i] = 9;').at(-1);
  assert.equal(write?.kind, 'index-assignment', 'no block, because nothing had to be hoisted');
  // Nothing is hoisted, because `a = e` performs no read: the target and index are lowered where
  // they stand and evaluated once by construction.
  const assignment = write as IndexAssignment;
  assert.equal(assignment.target.kind, 'identifier');
  assert.equal(assignment.index.kind, 'identifier');
  assert.equal(assignment.value.kind, 'number-literal');
});

test('a side-effecting index is evaluated once, not once per half', () => {
  const { temps, write } = readModifyWrite(
    'function i(): number { return 0; } const a: number[] = [1]; a[i()] += 5;',
  );
  // One temporary: the index. `a` is a bare identifier, which cannot have a side effect, so
  // hoisting it would be a slot spent for nothing.
  assert.equal(temps.length, 1);
  const [temp] = temps;
  assert.equal(
    temp === undefined ? undefined : requireInit(temp).kind,
    'call',
    'the hoisted expression is the call itself',
  );

  // Both the read and the write must name that ONE temporary.
  assert.equal(write.index.kind, 'identifier');
  const name = (write.index as { name: string }).name;
  assert.equal(temp?.name, name);
  assert.equal(write.value.kind, 'binary-op');
  const read = (write.value as { left: { kind: string; index: { name?: string } } }).left;
  assert.equal(read.kind, 'index-access');
  assert.equal(read.index.name, name, 'the read reuses the temporary, it does not re-evaluate');
});

test('a hoisted temporary cannot be named in source', () => {
  const { temps } = readModifyWrite(
    'function i(): number { return 0; } const a: number[] = [1]; a[i()] += 5;',
  );
  for (const temp of temps) {
    // A leading space is not a legal identifier, so no user binding can ever collide with one of
    // these, and no user expression can read one back.
    assert.match(temp.name, /^ /);
  }
});

test('a side-effecting target is hoisted too', () => {
  const { temps, write } = readModifyWrite('function f(): number[] { return [1]; } f()[0] += 5;');
  assert.equal(temps.length, 1, 'the target is hoisted; the literal index is not');
  assert.equal(temps[0] === undefined ? undefined : requireInit(temps[0]).kind, 'call');
  assert.equal(write.target.kind, 'identifier');
  assert.equal(write.index.kind, 'number-literal');
});

test('both halves are hoisted when both can have a side effect, target first', () => {
  const { temps } = readModifyWrite(
    'function f(): number[] { return [1]; } function i(): number { return 0; } f()[i()] += 5;',
  );
  assert.equal(temps.length, 2);
  // Order is the language's evaluation order: the target expression runs before the index.
  assert.deepEqual(
    temps.map((t) => requireInit(t).kind),
    ['call', 'call'],
  );
  assert.notEqual(temps[0]?.name, temps[1]?.name, 'each hoist gets its own slot');
});

test('++ on an element runs ToNumber first, unlike +=', () => {
  const { write } = readModifyWrite(
    'function i(): number { return 0; } const a: number[] = [1]; a[i()]++;',
  );
  // `a[i]++` is `a[i] = (+a[i]) + 1`. The explicit unary `+` is the whole difference from
  // `a[i] += 1`, which uses the `+` OPERATOR and would concatenate a string element instead.
  assert.equal(write.value.kind, 'binary-op');
  const left = (write.value as { left: { kind: string; operator?: string } }).left;
  assert.equal(left.kind, 'unary-op');
  assert.equal(left.operator, '+');
});

test('for-of binds the element type, not the indexed-read type', () => {
  const [, loop] = statements('const a: number[] = [1]; for (const x of a) { console.log(x); }');
  assert.equal(loop?.kind, 'for-of-statement');
  // `a[0]` would be `number | undefined` here -- Unknown. Iteration cannot run past the end, so
  // the binding is the element type and stays on the static path (plan-notes 53).
  const body = (loop as { body: Block }).body.statements[0];
  assert.equal(body?.kind, 'expression-statement');
  const arg = (body as { expression: { args: readonly { type: { kind: string } }[] } }).expression
    .args[0];
  assert.equal(arg?.type.kind, 'number');
});

test('an array literal takes its type from the checker, not from its elements', () => {
  const [decl] = statements('const a: unknown[] = [1, 2];');
  assert.equal(decl?.kind, 'declaration');
  const value = requireInit(decl as Declaration);
  assert.equal(value.kind, 'array-literal');
  // Two different types, both correct and both from the checker: the BINDING is `unknown[]`,
  // because that is the annotation, while the LITERAL is `number[]`, because that is what those
  // elements make. Deriving either from the element nodes instead would be a guess -- `[]` has no
  // elements to guess from, and `const a: unknown[] = []` would come out as `never[]`.
  assert.equal((decl as Declaration).type.kind, 'array');
  assert.equal(
    ((decl as Declaration).type as { element: { kind: string } }).element.kind,
    'unknown',
  );
  assert.equal(value.type.kind, 'array');
  assert.equal((value.type as { element: { kind: string } }).element.kind, 'number');
});
