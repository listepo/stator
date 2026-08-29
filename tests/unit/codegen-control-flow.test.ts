/* Emitter invariants for loops, switch and jumps that a golden test cannot isolate.
 *
 * tests/golden/ts/control-flow.ts proves the emitted program runs correctly; that is a claim
 * about the WHOLE program's behaviour, not about which mechanism produced it. What is here checks
 * the mechanisms directly: that an unused jump label is never written (plan-notes 46 — the runtime
 * builds with -Werror, where an unused label is an error), that `continue` lands in the position
 * that keeps a `for`'s update running and a `do/while`'s re-test honest, and that a malformed HIR
 * a later pass might construct is refused rather than silently mis-emitted. Nothing here asserts
 * the SPELLING of ordinary emitted work (see plan-notes 41) — only presence, absence, order, and
 * evaluation count, each of which is a real invariant a correct refactor must preserve. */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { emitC } from '../../src/codegen/index.ts';
import type {
  Block,
  BreakStatement,
  ContinueStatement,
  ForStatement,
  Statement,
  SwitchStatement,
} from '../../src/hir/nodes.ts';
import { H_UNDEFINED } from '../../src/hir/types.ts';
import { assign, block, decl, exprStmt, makeModule, num, whileStmt } from './helpers.ts';

void test('a loop with no break or continue emits no jump labels at all', () => {
  const c = emitC(makeModule([whileStmt(num(1), block([decl('x', num(1))]))]));

  // -Wall -Wextra -Werror treats an unused label as an error, so this is not cosmetic: an
  // always-emitted `brk_0: ;` would turn every plain `while` loop into a build failure.
  assert.doesNotMatch(c, /brk_\d+/);
  assert.doesNotMatch(c, /cont_\d+/);
  assert.doesNotMatch(c, /goto/);
});

void test('break alone emits a break label and no continue label', () => {
  const brk: BreakStatement = {
    kind: 'break-statement',
    type: H_UNDEFINED,
    span: whileStmt(num(1), block()).span,
  };
  const c = emitC(makeModule([whileStmt(num(1), block([brk]))]));

  assert.match(c, /goto brk_0;/);
  assert.match(c, /brk_0: ;/);
  assert.doesNotMatch(c, /cont_\d+/);
});

void test('continue in a for-loop lands between the body and the update, so the update still runs', () => {
  const cont: ContinueStatement = {
    kind: 'continue-statement',
    type: H_UNDEFINED,
    span: whileStmt(num(1), block()).span,
  };
  // A distinctive body statement and a distinctive update, so their emitted positions can be
  // told apart without caring how either is spelled.
  const forStmt: ForStatement = {
    kind: 'for-statement',
    type: H_UNDEFINED,
    span: whileStmt(num(1), block()).span,
    init: decl('i', num(0)),
    update: assign('i', num(999)),
    body: block([cont, exprStmt(num(555))]),
  };

  const c = emitC(makeModule([forStmt]));
  const contIndex = c.indexOf('cont_0: ;');
  const updateIndex = c.indexOf('999');
  const markerIndex = c.indexOf('555');

  assert.ok(contIndex > -1 && updateIndex > -1 && markerIndex > -1, 'all three must appear');
  // The naive lowering jumps to the TOP of the loop, which skips the update and hangs forever on
  // the first continue (plan-notes 46). The correct position is after the body, before the update.
  assert.ok(markerIndex < contIndex, 'continue label must come after the body');
  assert.ok(contIndex < updateIndex, 'continue label must come before the update');
});

void test('continue in a do/while jumps to the test, not past it', () => {
  const cont: ContinueStatement = {
    kind: 'continue-statement',
    type: H_UNDEFINED,
    span: whileStmt(num(1), block()).span,
  };
  const doWhile: Statement = {
    kind: 'do-while-statement',
    type: H_UNDEFINED,
    span: whileStmt(num(1), block()).span,
    condition: num(1),
    body: block([cont, exprStmt(num(555))]),
  };

  const c = emitC(makeModule([doWhile]));
  const contIndex = c.indexOf('cont_0: ;');
  const markerIndex = c.indexOf('555');
  const testIndex = c.indexOf('} while');

  assert.ok(contIndex > -1 && markerIndex > -1 && testIndex > -1);
  // If the loop still gets to decide whether to run again, the continue label sits BEFORE the
  // closing `} while (...)`, not after it.
  assert.ok(markerIndex < contIndex && contIndex < testIndex);
});

void test('the switch discriminant is evaluated once, not once per clause', () => {
  const clauses = [1, 2, 3].map((n) => ({ test: num(n), statements: [] as readonly Statement[] }));
  const stmt: SwitchStatement = {
    kind: 'switch-statement',
    type: H_UNDEFINED,
    span: whileStmt(num(1), block()).span,
    // A distinctive value: if the discriminant were re-emitted per clause instead of read from
    // its slot, "777.0" would appear three times instead of once.
    discriminant: num(777),
    clauses,
  };

  const c = emitC(makeModule([stmt]));
  const occurrences = c.split('777').length - 1;
  assert.equal(occurrences, 1, 'discriminant must be materialized into a slot once, then reused');
});

void test('for (;;) never calls jsrt_truthy: an absent condition is not a synthesized true', () => {
  const forStmt: ForStatement = {
    kind: 'for-statement',
    type: H_UNDEFINED,
    span: whileStmt(num(1), block()).span,
    body: block([
      { kind: 'break-statement', type: H_UNDEFINED, span: whileStmt(num(1), block()).span },
    ]),
  };

  const c = emitC(makeModule([forStmt]));
  // Nothing is evaluated at all for a condition that was never written -- "no test" and "a test
  // that happens to be true" must stay distinguishable, or a later pass could not tell them apart.
  assert.doesNotMatch(c, /jsrt_truthy/);
});

void test('emitC refuses a break/continue with no enclosing loop or switch, rather than emit a dangling goto', () => {
  // This HIR shape is impossible from the lowering and is caught earlier by the verifier
  // (STA4029) — this is the emitter's own backstop for a later pass that skips verification.
  // Without it, a `goto` to a label the emitter never wrote would fail in clang against
  // generated C the user never saw, instead of failing loudly at the point of the bug.
  const loose: BreakStatement = {
    kind: 'break-statement',
    type: H_UNDEFINED,
    span: whileStmt(num(1), block()).span,
  };
  assert.throws(() => emitC(makeModule([loose as unknown as Block])));
});
