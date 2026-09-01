/* The verifier's core type/scope invariants (src/hir/verify.ts) had no direct unit tests before
 * this file — STA4003 (assignment before declaration), STA4004 (assignment type mismatch) and
 * STA4020 (missing HType) were reachable only by accident, through whatever golden fixture or
 * decision test happened to trip them. STA4004 in particular is not a hypothetical: it was a real
 * bug in this project's history (a `+=` fold that hardcoded H_NUMBER instead of inferring the
 * fold's actual result type), caught by this exact check — see plan-notes 46. Nothing here is
 * control-flow-specific; tests/unit/control-flow.test.ts covers STA4029/STA4040 instead. */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { Declaration, Expression, MatchField, RegExpField } from '../../src/hir/nodes.ts';
import type { HType } from '../../src/hir/types.ts';
import { H_BOOLEAN, H_NUMBER, H_STRING, hUnknown } from '../../src/hir/types.ts';
import { verifyHir } from '../../src/hir/verify.ts';
import { assign, decl, makeModule, num, span, str } from './helpers.ts';

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

/* Task 4.1's match reads (STA4089). Both halves of the node's contract are checkable and neither
 * is reachable from source: the gate proves the receiver with the CHECKER before the lowering ever
 * builds one, so a bad node here means the lowering built it from something that is not a match. */

function matchRead(field: MatchField, target: Expression, type: HType): Expression {
  return { kind: 'match-read', type, span: span(1), field, target };
}

/** An expression standing in for `re.exec(s)`: a match or null, which the HIR calls Unknown. An
 * indexed read is the shortest Unknown-typed expression the verifier accepts on its own -- under
 * `noUncheckedIndexedAccess` that IS its type -- so the test needs no binding in scope. */
function matchTarget(): Expression {
  return {
    kind: 'index-access',
    type: hUnknown(false),
    span: span(1),
    target: {
      kind: 'array-literal',
      type: { kind: 'array', element: H_STRING },
      span: span(1),
      elements: [],
    },
    index: num(0),
  };
}

void test('a match read off an Unknown receiver, typed by its field, verifies clean', () => {
  assert.deepEqual(
    verifyHir(
      makeModule([
        decl('a', matchRead('index', matchTarget(), H_NUMBER)),
        decl('b', matchRead('length', matchTarget(), H_NUMBER)),
        decl('c', matchRead('input', matchTarget(), H_STRING)),
        decl('d', matchRead('groups', matchTarget(), hUnknown(false))),
      ]),
    ),
    [],
  );
});

void test('a match read whose receiver is concretely typed is STA4089', () => {
  // A match-or-null cannot be an array: a node claiming one means the lowering built this read
  // from a value the checker never proved was a match.
  const target: Expression = {
    kind: 'array-literal',
    type: { kind: 'array', element: H_STRING },
    span: span(1),
    elements: [],
  };
  const problems = verifyHir(makeModule([decl('a', matchRead('index', target, H_NUMBER))]));
  assert.equal(problems.length, 1);
  assert.equal(problems[0]?.code, 'STA4089');
});

void test('a match read whose result type is not the field’s is STA4089', () => {
  // `index` is a number the RUNTIME produced -- there is no annotation here to be wrong about, so
  // a string result is a lowering bug rather than a program making a claim.
  const problems = verifyHir(makeModule([decl('a', matchRead('index', matchTarget(), H_STRING))]));
  assert.equal(problems.length, 1);
  assert.equal(problems[0]?.code, 'STA4089');
});

/* Task 4.2's RegExp field reads (STA4090) -- the mirror of the above with the receiver pinned the
 * other way. A regexp IS concretely typed, and `jsrt_regexp_source` and friends dereference a
 * `JSRTRegExp` without asking, so a wrong receiver kind here is a wrong dereference. */

function regexpRead(field: RegExpField, target: Expression, type: HType): Expression {
  return { kind: 'regexp-read', type, span: span(1), field, target };
}

function regexpTarget(): Expression {
  return {
    kind: 'regexp-literal',
    type: { kind: 'regexp' },
    span: span(1),
    source: 'a',
    flags: '',
  };
}

void test('a regexp read off a regexp receiver, typed by its field, verifies clean', () => {
  assert.deepEqual(
    verifyHir(
      makeModule([
        decl('a', regexpRead('source', regexpTarget(), H_STRING)),
        decl('b', regexpRead('flags', regexpTarget(), H_STRING)),
        decl('c', regexpRead('lastIndex', regexpTarget(), H_NUMBER)),
        decl('d', regexpRead('global', regexpTarget(), H_BOOLEAN)),
      ]),
    ),
    [],
  );
});

void test('a regexp read whose receiver is not a regexp is STA4090', () => {
  const problems = verifyHir(makeModule([decl('a', regexpRead('source', str('x'), H_STRING))]));
  assert.equal(problems.length, 1);
  assert.equal(problems[0]?.code, 'STA4090');
});

void test('a regexp read whose result type is not the field’s is STA4090', () => {
  // `global` is a bit test: there is no annotation here to be wrong about, so a number result is a
  // lowering bug rather than a program making a claim.
  const problems = verifyHir(
    makeModule([decl('a', regexpRead('global', regexpTarget(), H_NUMBER))]),
  );
  assert.equal(problems.length, 1);
  assert.equal(problems[0]?.code, 'STA4090');
});
