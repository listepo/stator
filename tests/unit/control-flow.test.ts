/* Control flow: the lowering folds, and the two verifier invariants that generated C depends on.
 *
 * The behavioural proof for loops and switch is tests/golden/ts/control-flow.ts, which runs the
 * program and diffs against Node. What is here is what a golden test cannot reach: the SHAPE the
 * lowering produces (because `+=` and `++` are folds, and a fold that is subtly wrong still runs),
 * and HIR the lowering never emits at all (because the verifier's job is to catch a later pass
 * emitting it). Nothing here asserts emitted C spelling — see plan-notes 41. */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type {
  Block,
  BreakStatement,
  ContinueStatement,
  SwitchStatement,
} from '../../src/hir/nodes.ts';
import { H_NUMBER, H_UNDEFINED } from '../../src/hir/types.ts';
import { verifyHir } from '../../src/hir/verify.ts';
import { block, id, lowerSource, makeModule, num, span, whileStmt } from './helpers.ts';

void test('compound assignment folds to the equivalent binary operation', () => {
  const { module } = lowerSource('let x: number = 1;\nx += 2;');

  const stmt = module.statements[1];
  assert.ok(stmt);
  assert.equal(stmt.kind, 'assignment');
  if (stmt.kind !== 'assignment') return;

  assert.equal(stmt.target, 'x');
  assert.equal(stmt.value.kind, 'binary-op');
  if (stmt.value.kind !== 'binary-op') return;

  // `x += 2` is `x = x + 2`: the operator is the plain `+`, not a compound one, so it inherits
  // string concatenation for free rather than needing its own coercion rule.
  assert.equal(stmt.value.operator, '+');
  assert.equal(stmt.value.left.kind, 'identifier');
  assert.equal(stmt.value.right.kind, 'number-literal');
});

void test('++ coerces with unary + before adding, which += does not', () => {
  const { module } = lowerSource('let x: number = 1;\nx++;');

  const stmt = module.statements[1];
  assert.ok(stmt);
  assert.equal(stmt.kind, 'assignment');
  if (stmt.kind !== 'assignment' || stmt.value.kind !== 'binary-op') {
    assert.fail('x++ should lower to an assignment of a binary op');
  }

  assert.equal(stmt.value.operator, '+');
  // The distinguishing detail. `x++` is ToNumber(x) + 1, so for x = '5' it is 6, while `x += 1`
  // is '51'. The unary `+` is what makes those two differ; without it both would concatenate.
  assert.equal(stmt.value.left.kind, 'unary-op');
  if (stmt.value.left.kind === 'unary-op') {
    assert.equal(stmt.value.left.operator, '+');
    assert.equal(stmt.value.left.operand.kind, 'identifier');
  }
});

void test('prefix and postfix decrement lower identically when the value is discarded', () => {
  // Spans differ — the operand sits at a different offset in `x--` than in `--x` — so this
  // compares the structure, which is the part that has to agree.
  const shape = (code: string): string => {
    const stmt = lowerSource(`let x: number = 1;\n${code}`).module.statements[1];
    return JSON.stringify(stmt, (key, value: unknown) => (key === 'span' ? undefined : value));
  };
  assert.equal(shape('x--;'), shape('--x;'));
});

void test('a label is carried on the loop, not wrapped around it', () => {
  const { module } = lowerSource('outer: while (true) { break outer; }');

  const stmt = module.statements[0];
  assert.ok(stmt);
  assert.equal(stmt.kind, 'while-statement');
  if (stmt.kind !== 'while-statement') return;
  assert.equal(stmt.label, 'outer');

  const inner = stmt.body.statements[0];
  assert.ok(inner);
  assert.equal(inner.kind, 'break-statement');
  if (inner.kind === 'break-statement') {
    assert.equal(inner.label, 'outer');
  }
});

void test('a for header keeps all three slots, and an absent condition stays absent', () => {
  const full = lowerSource('for (let i: number = 0; i < 3; i++) { }').module.statements[0];
  assert.ok(full);
  assert.equal(full.kind, 'for-statement');
  if (full.kind === 'for-statement') {
    assert.equal(full.init?.kind, 'declaration');
    assert.ok(full.condition);
    assert.equal(full.update?.kind, 'assignment');
  }

  // `for (;;)` must not acquire a synthesised `true`: an absent condition is the emitter's signal
  // to drop the test entirely, and a literal would make the two cases indistinguishable.
  const bare = lowerSource('for (;;) { break; }').module.statements[0];
  assert.ok(bare);
  assert.equal(bare.kind, 'for-statement');
  if (bare.kind === 'for-statement') {
    assert.equal(bare.condition, undefined);
    assert.equal(bare.init, undefined);
    assert.equal(bare.update, undefined);
  }
});

void test('switch keeps clauses in source order with default in place', () => {
  const { module } = lowerSource(
    'const x: number = 1;\nswitch (x) { case 1: break; default: break; case 2: break; }',
  );

  const stmt = module.statements[1];
  assert.ok(stmt);
  assert.equal(stmt.kind, 'switch-statement');
  if (stmt.kind !== 'switch-statement') return;

  // Source order, NOT default-last. `default` is *tried* last but still falls through from the
  // clause written above it, so hoisting it here would change which statements run.
  assert.equal(stmt.clauses.length, 3);
  assert.ok(stmt.clauses[0]?.test);
  assert.equal(stmt.clauses[1]?.test, undefined);
  assert.ok(stmt.clauses[2]?.test);
});

void test('verifier rejects a break naming a label that encloses nothing', () => {
  const brk: BreakStatement = {
    kind: 'break-statement',
    type: H_UNDEFINED,
    span: span(2),
    label: 'nowhere',
  };
  const problems = verifyHir(makeModule([whileStmt(num(1), block([brk]))]));

  assert.equal(problems.length, 1);
  assert.equal(problems[0]?.code, 'STA4029');
});

void test('verifier rejects continue outside any loop, but allows it inside a switch in a loop', () => {
  const cont: ContinueStatement = {
    kind: 'continue-statement',
    type: H_UNDEFINED,
    span: span(2),
  };

  // A switch is breakable but NOT continuable, so a bare `continue` inside one has to look past
  // it to the enclosing loop. Outside a loop entirely there is nothing to find.
  const loose: SwitchStatement = {
    kind: 'switch-statement',
    type: H_UNDEFINED,
    span: span(1),
    discriminant: num(1),
    clauses: [{ test: num(1), statements: [cont] }],
  };
  assert.equal(verifyHir(makeModule([loose]))[0]?.code, 'STA4029');

  const wrapped: Block = block([loose], H_UNDEFINED);
  assert.deepEqual(verifyHir(makeModule([whileStmt(num(1), wrapped)])), []);
});

void test('verifier rejects a switch with two default clauses', () => {
  const twoDefaults: SwitchStatement = {
    kind: 'switch-statement',
    type: H_UNDEFINED,
    span: span(1),
    discriminant: id('x', H_NUMBER),
    clauses: [{ statements: [] }, { statements: [] }],
  };
  const problems = verifyHir(makeModule([twoDefaults]));

  assert.ok(problems.some((p) => p.code === 'STA4040'));
});

void test('a labelled break in a doubly-nested loop reaches past the inner loop by name', () => {
  const brk: BreakStatement = {
    kind: 'break-statement',
    type: H_UNDEFINED,
    span: span(3),
    label: 'outer',
  };
  const inner = whileStmt(num(1), block([brk]));
  const outer = { ...whileStmt(num(1), block([inner])), label: 'outer' };

  // The verifier has to look PAST the innermost loop to find the labelled one — an unlabelled
  // search would stop at `inner` and wrongly accept or reject depending on what it found there.
  assert.deepEqual(verifyHir(makeModule([outer])), []);
});

void test('continue cannot target a label that belongs to a switch, even reaching through a loop', () => {
  const cont: ContinueStatement = {
    kind: 'continue-statement',
    type: H_UNDEFINED,
    span: span(2),
    label: 'tag',
  };
  const taggedSwitch: SwitchStatement = {
    kind: 'switch-statement',
    type: H_UNDEFINED,
    span: span(1),
    discriminant: num(1),
    clauses: [{ test: num(1), statements: [cont] }],
    label: 'tag',
  };

  // `continue tag` cannot bind to a switch labelled `tag` no matter what encloses it — `continue`
  // only ever targets a LOOP. Wrapping it in an outer loop must not accidentally satisfy the
  // search by matching on isLoop while ignoring that the label names something else.
  const wrapped = whileStmt(num(1), block([taggedSwitch]));
  const problems = verifyHir(makeModule([wrapped]));
  assert.equal(problems.length, 1);
  assert.equal(problems[0]?.code, 'STA4029');
});
