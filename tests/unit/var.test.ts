/* var desugaring (plan.md §8 step 3): function-scoped, hoisted, initialized undefined.
 *
 * The HIR has no `var` kind. Each binding becomes a `let` at the top of its function (or
 * module) initialized to `undefined`, and the original site is an assignment. These tests pin
 * that shape so a later pass cannot "simplify" a read-before-write back into a TDZ. */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { verifyHir } from '../../src/hir/verify.ts';
import { lowerSource } from './helpers.ts';

void test('var at module level hoists a let initialized undefined, then assigns', () => {
  const { module, diagnostics } = lowerSource('console.log(x);\nvar x = 1;\n', '/test.js');
  assert.deepEqual(
    diagnostics.map((d) => d.code),
    [],
  );
  assert.ok(module);
  const kinds = module.statements.map((s) => s.kind);
  assert.deepEqual(kinds, ['declaration', 'expression-statement', 'assignment']);
  const decl = module.statements[0];
  assert.equal(decl?.kind, 'declaration');
  if (decl?.kind === 'declaration') {
    assert.equal(decl.name, 'x');
    assert.equal(decl.declKind, 'let');
    assert.equal(decl.value.kind, 'undefined-literal');
  }
  const assign = module.statements[2];
  assert.equal(assign?.kind, 'assignment');
  if (assign?.kind === 'assignment') {
    assert.equal(assign.target, 'x');
    assert.equal(assign.value.kind, 'number-literal');
  }
  assert.deepEqual(verifyHir(module), []);
});

void test('a second var of the same name is an assignment, not a second slot', () => {
  const { module, diagnostics } = lowerSource('var x = 1;\nvar x = 2;\n', '/test.js');
  assert.deepEqual(
    diagnostics.map((d) => d.code),
    [],
  );
  assert.ok(module);
  const decls = module.statements.filter((s) => s.kind === 'declaration');
  const assigns = module.statements.filter((s) => s.kind === 'assignment');
  assert.equal(decls.length, 1, 'one slot');
  assert.equal(assigns.length, 2, 'two writes');
  assert.deepEqual(verifyHir(module), []);
});

void test('var inside a block is visible after it', () => {
  const { module, diagnostics } = lowerSource(
    'if (true) { var y = 7; }\nconsole.log(y);\n',
    '/test.js',
  );
  assert.deepEqual(
    diagnostics.map((d) => d.code),
    [],
  );
  assert.ok(module);
  const decl = module.statements.find((s) => s.kind === 'declaration');
  assert.equal(decl?.kind, 'declaration');
  if (decl?.kind === 'declaration') {
    assert.equal(decl.name, 'y');
    assert.equal(decl.value.kind, 'undefined-literal');
  }
  assert.deepEqual(verifyHir(module), []);
});

void test('var that repeats a parameter name does not allocate a second slot', () => {
  const { module, diagnostics } = lowerSource(
    'function f(x) { var x = 2; return x; }\n',
    '/test.js',
  );
  assert.deepEqual(
    diagnostics.map((d) => d.code),
    [],
  );
  assert.ok(module);
  const fnDecl = module.statements.find((s) => s.kind === 'function-declaration');
  assert.equal(fnDecl?.kind, 'function-declaration');
  if (fnDecl?.kind !== 'function-declaration') {
    return;
  }
  const bodyDecls = fnDecl.fn.body.statements.filter((s) => s.kind === 'declaration');
  assert.equal(bodyDecls.length, 0, 'parameter owns the slot');
  const assigns = fnDecl.fn.body.statements.filter((s) => s.kind === 'assignment');
  assert.equal(assigns.length, 1);
  if (assigns[0]?.kind === 'assignment') {
    assert.equal(assigns[0].target, 'x');
  }
  assert.deepEqual(verifyHir(module), []);
});

void test('var without an initializer is a hoist and a no-op at the site', () => {
  const { module, diagnostics } = lowerSource('var x;\nconsole.log(x);\n', '/test.js');
  assert.deepEqual(
    diagnostics.map((d) => d.code),
    [],
  );
  assert.ok(module);
  assert.equal(module.statements[0]?.kind, 'declaration');
  // The original `var x;` becomes an empty block (no assignment to emit).
  assert.ok(module.statements.some((s) => s.kind === 'block'));
  assert.deepEqual(verifyHir(module), []);
});
