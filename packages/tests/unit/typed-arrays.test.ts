/* plan.md §11c T11.1: `Uint8Array` + `ArrayBuffer`. One `typed-op` HIR node carries every landed
 * member, driven by the TYPED_OPS row it names, so the verifier's claims (STA4101) are the row's:
 * the receiver kind, the padded operand count and the result type. The goldens prove the runtime
 * against Node; these prove that the lowering builds what the table says and that a node
 * disagreeing with its row is caught before codegen trusts it. */

import { strict as assert } from 'node:assert';
import { test } from 'vitest';
import type { Expression, TypedOperation } from '../../compiler/src/hir/nodes.ts';
import { TYPED_OPS, typedResultType } from '../../compiler/src/hir/nodes.ts';
import type { HType } from '../../compiler/src/hir/types.ts';
import { H_UINT8ARRAY, H_UNDEFINED } from '../../compiler/src/hir/types.ts';
import { verifyHir } from '../../compiler/src/hir/verify.ts';
import {
  decl,
  gateCodes,
  hirNodes,
  makeModule,
  num,
  span,
  str,
  verifiedStatements,
} from './helpers.ts';

function typedOp(op: TypedOperation, args: readonly Expression[], type?: HType): Expression {
  return {
    kind: 'typed-op',
    type: type ?? typedResultType(TYPED_OPS[op].result),
    span: span(1),
    op,
    args,
  };
}

const UNDEFINED: Expression = { kind: 'undefined-literal', type: H_UNDEFINED, span: span(1) };

function newView(): Expression {
  return typedOp('new Uint8Array', [num(4), UNDEFINED, UNDEFINED]);
}

test('every landed member lowers to a typed-op naming its row, and the module verifies clean', () => {
  const statements = verifiedStatements(`
    const b = new ArrayBuffer(8);
    const u = new Uint8Array(b, 1);
    u[0] = 300;
    u.set([1], 1);
    const n = u.length + u.byteLength + u.byteOffset + b.byteLength + b.slice(1).byteLength;
    const same = u.buffer === b;
    const parts = [u.subarray(1), u.slice(0, 2)];
    for (const x of u) {
      console.log(x, n, same, parts);
    }
  `);
  const ops = hirNodes(statements)
    .filter((node): node is { kind: 'typed-op'; op: string } => node.kind === 'typed-op')
    .map((node) => node.op)
    .sort();
  assert.deepEqual(ops, [
    'ArrayBuffer.prototype.byteLength',
    'ArrayBuffer.prototype.byteLength',
    'ArrayBuffer.prototype.slice',
    'Uint8Array.prototype.buffer',
    'Uint8Array.prototype.byteLength',
    'Uint8Array.prototype.byteOffset',
    'Uint8Array.prototype.length',
    'Uint8Array.prototype.set',
    'Uint8Array.prototype.slice',
    'Uint8Array.prototype.subarray',
    'new ArrayBuffer',
    'new Uint8Array',
  ]);
});

test('a typed-op with its row’s receiver, arity and result verifies clean', () => {
  const problems = verifyHir(
    makeModule([
      decl('u', newView()),
      decl('n', typedOp('Uint8Array.prototype.length', [newView()])),
      decl('s', typedOp('Uint8Array.prototype.subarray', [newView(), num(1), UNDEFINED])),
    ]),
  );
  assert.deepEqual(problems, []);
});

test('a typed-op on the wrong receiver kind is STA4101', () => {
  const problems = verifyHir(
    makeModule([decl('n', typedOp('Uint8Array.prototype.length', [str('x')]))]),
  );
  assert.deepEqual(
    problems.map((p) => p.code),
    ['STA4101'],
  );
});

test('a typed-op whose operands were not padded to the row’s arity is STA4101', () => {
  // `u.subarray(1)` lowers with `end` padded to `undefined`; a short list is a lowering bug.
  const problems = verifyHir(
    makeModule([decl('s', typedOp('Uint8Array.prototype.subarray', [newView(), num(1)]))]),
  );
  assert.deepEqual(
    problems.map((p) => p.code),
    ['STA4101'],
  );
});

test('a typed-op whose type is not its row’s result is STA4101', () => {
  const problems = verifyHir(
    makeModule([decl('n', typedOp('Uint8Array.prototype.length', [newView()], H_UINT8ARRAY))]),
  );
  assert.deepEqual(
    problems.map((p) => p.code),
    ['STA4101'],
  );
});

test('the unlanded surface is refused by its qualified name, in both modes', () => {
  for (const mode of ['ts', 'js'] as const) {
    assert.deepEqual(gateCodes('const u = new Uint8Array(2);\nu.fill(1);\n', mode), ['STA1214']);
    assert.deepEqual(gateCodes('const u = Uint8Array.from([1]);\n', mode), ['STA1214']);
    assert.deepEqual(gateCodes('const u = new Uint8Array(2);\nconst f = u.subarray;\n', mode), [
      'STA1214',
    ]);
  }
});
