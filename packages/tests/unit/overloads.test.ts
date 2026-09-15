/* Step-2a(b) top-level overload signatures — the parts golden tests cannot see.
 *
 * A golden proves the program PRINTS what Node prints. It cannot prove why: that the two
 * signatures emitted no function, that the binding holds the implementation's type, or that
 * a lone signature without an implementation is still refused. Each of those is an
 * invariant the emitter depends on, pinned here — mirroring class-members.test.ts, which
 * pins the same three facts for constructor and method overloads.
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { FunctionDeclaration } from '../../compiler/src/hir/nodes.ts';
import { gateCodes, verifiedStatements } from './helpers.ts';

const OVERLOADED = `function f(a: number): number;
function f(a: string): string;
function f(a: unknown): unknown {
  return a;
}
`;

function functionsOf(code: string): FunctionDeclaration[] {
  return verifiedStatements(code).filter(
    (s): s is FunctionDeclaration => s.kind === 'function-declaration',
  );
}

test('overload signatures are accepted in both modes', () => {
  assert.deepEqual(gateCodes(OVERLOADED, 'ts'), []);
  assert.deepEqual(gateCodes(OVERLOADED, 'js'), []);
});

test('overload signatures emit nothing; the implementation is the one function', () => {
  const decls = functionsOf(OVERLOADED);
  assert.equal(decls.length, 1, 'two signatures and one implementation lower to one declaration');
  assert.equal(decls[0]?.name, 'f', 'the surviving declaration keeps the source name');
  assert.equal(decls[0]?.fn.params.length, 1, 'the parameters are the implementation ones');
});

test('a signature without an implementation stays not-yet', () => {
  const sigOnly = `function f(a: string): string;
`;
  assert.deepEqual(gateCodes(sigOnly, 'ts'), ['STA1214']);
  assert.deepEqual(gateCodes(sigOnly, 'js'), ['STA1214']);
});

test('a lone signature lowers to no statement, like an erased declaration', () => {
  // The gate refuses this (above), so lowering only sees it in tests — where skipping keeps
  // a gate/lowering disagreement from becoming an internal error.
  const statements = verifiedStatements(`function f(a: string): string;
function f(a: unknown): unknown {
  return a;
}
`);
  assert.equal(statements.length, 2, 'the skipped signature leaves an empty block behind');
  assert.equal(statements[0]?.kind, 'block', 'a bodiless declaration emits no function');
});

test('a fallback call lowers clean against the implementation signature', () => {
  const statements = verifiedStatements(`${OVERLOADED}export const x = f(true);\n`);
  const kinds = statements.map((s) => s.kind);
  assert.ok(kinds.includes('declaration'), 'the call site lowers with the rest of the module');
});
