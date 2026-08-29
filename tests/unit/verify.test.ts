/* The verifier's core type/scope invariants (src/hir/verify.ts) had no direct unit tests before
 * this file — STA4003 (assignment before declaration), STA4004 (assignment type mismatch) and
 * STA4020 (missing HType) were reachable only by accident, through whatever golden fixture or
 * decision test happened to trip them. STA4004 in particular is not a hypothetical: it was a real
 * bug in this project's history (a `+=` fold that hardcoded H_NUMBER instead of inferring the
 * fold's actual result type), caught by this exact check — see plan-notes 46. Nothing here is
 * control-flow-specific; tests/unit/control-flow.test.ts covers STA4029/STA4040 instead. */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { Declaration } from '../../src/hir/nodes.ts';
import type { HType } from '../../src/hir/types.ts';
import { verifyHir } from '../../src/hir/verify.ts';
import { assign, decl, makeModule, num, str } from './helpers.ts';

void test('a well-typed declaration followed by a matching assignment verifies clean', () => {
  const problems = verifyHir(makeModule([decl('x', num(1)), assign('x', num(2))]));
  assert.deepEqual(problems, []);
});

void test('assigning to an identifier with no prior declaration is STA4003, not a crash', () => {
  const problems = verifyHir(makeModule([assign('y', num(1))]));
  assert.equal(problems.length, 1);
  assert.equal(problems[0]?.code, 'STA4003');
});

void test('assigning a value whose type disagrees with the binding is STA4004', () => {
  // `let x: number = 1;` followed by `x = "hi"` -- a mismatch no runtime coercion should paper
  // over, since HIR values are already-typed by the time the verifier sees them.
  const problems = verifyHir(makeModule([decl('x', num(1)), assign('x', str('hi'))]));
  assert.equal(problems.length, 1);
  assert.equal(problems[0]?.code, 'STA4004');
});

void test('a statement with no HType at all is STA4020, caught before anything reads its type', () => {
  const untyped: Declaration = {
    kind: 'declaration',
    type: undefined as unknown as HType,
    span: { start: 0, length: 0, line: 1 },
    name: 'x',
    declKind: 'let',
    value: num(1),
  };
  const problems = verifyHir(makeModule([untyped]));
  assert.equal(problems.length, 1);
  assert.equal(problems[0]?.code, 'STA4020');
});
