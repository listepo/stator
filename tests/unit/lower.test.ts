import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { Declaration, FunctionExpr } from '../../src/hir/nodes.ts';
import { verifyHir } from '../../src/hir/verify.ts';
import { hirNodes, lowerSource, requireInit } from './helpers.ts';

void test('console.log with arithmetic expression and correct precedence', () => {
  const result = lowerSource('console.log(1 + 2 * 3);');

  assert.equal(result.diagnostics.length, 0, 'Should have no diagnostics');
  assert.ok(result.module, 'Should produce a module');
  assert.equal(result.module.statements.length, 1, 'Should have one statement');

  const stmt = result.module.statements[0];
  assert.ok(stmt, 'Statement should exist');
  assert.equal(stmt.kind, 'expression-statement', 'Should be an expression statement');

  if (stmt.kind === 'expression-statement') {
    const expr = stmt.expression;
    assert.equal(expr.kind, 'console-log', 'Should be a console.log call');

    if (expr.kind === 'console-log') {
      assert.equal(expr.args.length, 1, 'Should have one argument');
      const arg = expr.args[0];
      assert.ok(arg, 'Arg should exist');
      assert.equal(arg.kind, 'binary-op', 'Argument should be a binary op');

      if (arg.kind === 'binary-op') {
        assert.equal(arg.operator, '+', 'Root operator should be +');
        assert.equal(arg.left.kind, 'number-literal', 'Left should be number 1');
        assert.equal(arg.right.kind, 'binary-op', 'Right should be binary-op for 2 * 3');

        if (arg.right.kind === 'binary-op') {
          assert.equal(arg.right.operator, '*', 'Right operator should be *');
          assert.equal(arg.right.left.kind, 'number-literal', 'Right-left should be number 2');
          assert.equal(arg.right.right.kind, 'number-literal', 'Right-right should be number 3');
        }
      }
    }
  }
});

void test('let and while loop for counting', () => {
  const source = `
let x: number = 0;
while (x < 3) {
  x = x + 1;
}
`;
  const result = lowerSource(source);

  assert.equal(result.diagnostics.length, 0, 'Should have no diagnostics');
  assert.ok(result.module, 'Should produce a module');
  assert.equal(result.module.statements.length, 2, 'Should have two statements');

  const decl = result.module.statements[0];
  assert.ok(decl, 'First statement should exist');
  assert.equal(decl.kind, 'declaration', 'First statement should be a declaration');
  if (decl.kind === 'declaration') {
    assert.equal(decl.name, 'x', 'Should declare x');
    assert.equal(decl.declKind, 'let', 'Should be let');
    const init = requireInit(decl);
    assert.equal(init.kind, 'number-literal', 'Initial value should be number literal');
    if (init.kind === 'number-literal') {
      assert.equal(init.value, 0, 'Initial value should be 0');
    }
  }

  const whileStmt = result.module.statements[1];
  assert.ok(whileStmt, 'Second statement should exist');
  assert.equal(whileStmt.kind, 'while-statement', 'Second statement should be a while');
  if (whileStmt.kind === 'while-statement') {
    assert.equal(whileStmt.condition.kind, 'binary-op', 'Condition should be binary-op');
    assert.equal(whileStmt.body.kind, 'block', 'Body should be a block');
    if (whileStmt.body.kind === 'block') {
      assert.equal(whileStmt.body.statements.length, 1, 'Block should have one statement');
      const assign = whileStmt.body.statements[0];
      assert.ok(assign, 'Assignment should exist');
      assert.equal(assign.kind, 'assignment', 'Block should contain an assignment');
    }
  }
});

void test('span line numbers are 1-indexed and match source', () => {
  const source = `console.log(42);\nlet x: number = 1;`;
  const result = lowerSource(source);

  assert.ok(result.module, 'Should produce a module');
  assert.equal(result.module.statements.length, 2, 'Should have two statements');

  const first = result.module.statements[0];
  assert.ok(first, 'First statement should exist');
  assert.equal(first.span.line, 1, 'First statement should be on line 1');

  const second = result.module.statements[1];
  assert.ok(second, 'Second statement should exist');
  assert.equal(second.span.line, 2, 'Second statement should be on line 2');
});

void test('module with multiple statements lowers without errors', () => {
  const source = `
let a: number = 5;
let b: number = 3;
console.log(a + b);
`;
  const result = lowerSource(source);

  assert.ok(result.module, 'Should produce a module');
  assert.equal(result.diagnostics.length, 0, 'Should have no diagnostics');
  assert.equal(result.module.statements.length, 3, 'Should have three statements');
});

void test('if-else statement', () => {
  const source = `
let x: number = 5;
if (x > 3) {
  console.log(1);
} else {
  console.log(2);
}
`;
  const result = lowerSource(source);

  assert.equal(result.diagnostics.length, 0, 'Should have no diagnostics');
  assert.ok(result.module, 'Should produce a module');
  assert.equal(result.module.statements.length, 2, 'Should have declaration and if statement');

  const ifStmt = result.module.statements[1];
  assert.ok(ifStmt, 'If statement should exist');
  assert.equal(ifStmt.kind, 'if-statement', 'Should be an if statement');
  if (ifStmt.kind === 'if-statement') {
    assert.ok(ifStmt.alternate, 'Should have an else branch');
    assert.equal(ifStmt.consequent.kind, 'block', 'Consequent should be a block');
    assert.equal(ifStmt.alternate.kind, 'block', 'Alternate should be a block');
  }
});

void test('nested if statements lower without errors', () => {
  const source = `
let x: number = 5;
if (x > 3) {
  if (x < 10) {
    console.log(1);
  }
}
`;
  const result = lowerSource(source);

  assert.equal(result.diagnostics.length, 0, 'Should have no diagnostics');
  assert.ok(result.module, 'Should produce a module');
  assert.equal(result.module.statements.length, 2, 'Should have declaration and if statement');

  const ifStmt = result.module.statements[1];
  assert.ok(ifStmt, 'If statement should exist');
  assert.equal(ifStmt.kind, 'if-statement', 'Should be an if statement');
});

void test('assignment to existing binding', () => {
  const source = `
let x: number = 1;
x = 2;
console.log(x);
`;
  const result = lowerSource(source);

  assert.equal(result.diagnostics.length, 0, 'Should have no diagnostics');
  assert.ok(result.module, 'Should produce a module');
  assert.equal(result.module.statements.length, 3, 'Should have 3 statements');

  const assign = result.module.statements[1];
  assert.ok(assign, 'Assignment should exist');
  assert.equal(assign.kind, 'assignment', 'Second statement should be assignment');
  if (assign.kind === 'assignment') {
    assert.equal(assign.target, 'x', 'Should assign to x');
    assert.equal(assign.value.kind, 'number-literal', 'Value should be number literal');
  }
});

void test('multiple identifiers in expression', () => {
  const source = `
let x: number = 1;
let y: number = 2;
console.log(x + y);
`;
  const result = lowerSource(source);

  assert.equal(result.diagnostics.length, 0, 'Should have no diagnostics');
  assert.ok(result.module, 'Should produce a module');

  const exprStmt = result.module.statements[2];
  assert.ok(exprStmt, 'Expression statement should exist');
  assert.equal(exprStmt.kind, 'expression-statement', 'Should be expression statement');
  if (exprStmt.kind === 'expression-statement') {
    const expr = exprStmt.expression;
    assert.equal(expr.kind, 'console-log', 'Should be console.log');
    if (expr.kind === 'console-log') {
      const arg = expr.args[0];
      assert.ok(arg, 'Arg should exist');
      assert.equal(arg.kind, 'binary-op', 'Argument should be binary op');
      if (arg.kind === 'binary-op') {
        assert.equal(arg.left.kind, 'identifier', 'Left should be identifier');
        assert.equal(arg.right.kind, 'identifier', 'Right should be identifier');
        if (arg.left.kind === 'identifier' && arg.right.kind === 'identifier') {
          assert.equal(arg.left.name, 'x', 'Left identifier should be x');
          assert.equal(arg.right.name, 'y', 'Right identifier should be y');
        }
      }
    }
  }
});

void test('comparison operators', () => {
  const source = `
let x: number = 5;
if (x >= 3) {
  console.log(1);
}
`;
  const result = lowerSource(source);

  assert.equal(result.diagnostics.length, 0, 'Should have no diagnostics');
  assert.ok(result.module, 'Should produce a module');

  const ifStmt = result.module.statements[1];
  assert.ok(ifStmt, 'If statement should exist');
  assert.equal(ifStmt.kind, 'if-statement', 'Should be if statement');
  if (ifStmt.kind === 'if-statement') {
    const cond = ifStmt.condition;
    assert.equal(cond.kind, 'binary-op', 'Condition should be binary-op');
    if (cond.kind === 'binary-op') {
      assert.equal(cond.operator, '>=', 'Operator should be >=');
    }
  }
});

void test('string literals', () => {
  const source = `console.log("hello");`;
  const result = lowerSource(source);

  assert.equal(result.diagnostics.length, 0, 'Should have no diagnostics');
  assert.ok(result.module, 'Should produce a module');

  const exprStmt = result.module.statements[0];
  assert.ok(exprStmt, 'Expression statement should exist');
  if (exprStmt.kind === 'expression-statement') {
    const expr = exprStmt.expression;
    if (expr.kind === 'console-log') {
      const arg = expr.args[0];
      assert.ok(arg, 'Arg should exist');
      assert.equal(arg.kind, 'string-literal', 'Argument should be string literal');
      if (arg.kind === 'string-literal') {
        assert.equal(arg.value, 'hello', 'String value should be "hello"');
      }
    }
  }
});

void test('boolean literals in if conditions lower without errors', () => {
  const source = `
let flag: boolean = true;
if (flag) {
  console.log(false);
}
`;
  const result = lowerSource(source);

  assert.equal(result.diagnostics.length, 0, 'Should have no diagnostics');
  assert.ok(result.module, 'Should produce a module');
  assert.equal(result.module.statements.length, 2, 'Should have two statements');

  const ifStmt = result.module.statements[1];
  assert.ok(ifStmt, 'If statement should exist');
  assert.equal(ifStmt.kind, 'if-statement', 'Should be an if statement');
});

void test('arithmetic with different operators lower without errors', () => {
  const source = `
let a: number = 10;
let b: number = 3;
console.log(a - b);
console.log(a / b);
console.log(a % b);
`;
  const result = lowerSource(source);

  assert.equal(result.diagnostics.length, 0, 'Should have no diagnostics');
  assert.ok(result.module, 'Should produce a module');
  assert.equal(result.module.statements.length, 5, 'Should have five statements');
});

/* A binding's HType comes from the BINDING, not from what it happened to be initialized with.
 * Taking the initializer's type made `let x: string | number = 1` a `number` slot, so the legal
 * `x = 'a'` that followed was reported as STA4004 — an internal compiler error on correct source. */
test('an annotation wider than the initializer is the binding type', () => {
  const { module } = lowerSource('let x: string | number = 1;');
  const [decl] = module.statements;
  assert.equal(decl?.kind, 'declaration');
  // `string | number` has no HType yet, so it is Unknown -- which is the point: Unknown is what
  // makes the slot able to hold either, and `number` would have promised something false.
  assert.equal((decl as Declaration).type.kind, 'unknown');
  assert.equal(requireInit(decl as Declaration).type.kind, 'number');
});

test('assigning any type to an Unknown binding verifies clean', () => {
  const { module } = lowerSource("let x: string | number = 1; x = 'a';");
  const problems = verifyHir(module);
  assert.deepEqual(
    problems.map((p) => p.code),
    [],
  );
});

/* Provenance (plan.md §8 step 1) is about the SIGNATURE: what the author asserted versus what the
 * checker worked out. The distinction is rule 4's -- an annotation is a claim a boundary must
 * check, an inference is derived from the code and is already sound -- so it is the annotations
 * that are counted, not the resulting types. */
test('provenance separates annotated signatures from inferred ones', () => {
  const { module } = lowerSource(
    'function both(x: number): number { return x; }\n' +
      'function noReturn(x: number) { return x; }\n' +
      'const arrow = (x: number) => x;\n',
  );
  assert.deepEqual(
    hirNodes(module)
      .filter((n): n is { kind: string } & FunctionExpr => n.kind === 'function')
      .map((f) => [f.name ?? '<anonymous>', f.provenance]),
    [
      ['both', 'typed'],
      ['noReturn', 'inferred'],
      [
        // The arrow's parameter is annotated but its return is not, so it is `inferred` for the
        // same reason `noReturn` is -- the shape of the declaration never enters into it.
        '<anonymous>',
        'inferred',
      ],
    ],
  );
});

/* The JSDoc freebie (plan.md §8 step 6). `@param {number} x` is the same claim by the same author
 * as `x: number`, so annotated JavaScript must buy exactly what annotated TypeScript buys -- and be
 * trusted exactly as little at a boundary. */
test('JSDoc annotations are annotations, and their absence is Unknown', () => {
  const { module } = lowerSource(
    '/**\n * @param {number} x\n * @returns {number}\n */\n' +
      'function documented(x) { return x; }\n' +
      'function bare(x) { return x; }\n',
    '/test.js',
  );
  assert.deepEqual(
    hirNodes(module)
      .filter((n): n is { kind: string } & FunctionExpr => n.kind === 'function')
      .map((f) => [f.name ?? '<anonymous>', f.provenance]),
    [
      ['documented', 'typed'],
      // Not `inferred`: nothing was inferred. An un-annotated js parameter is Unknown, which is the
      // request for a dynamic value, and that outranks every other reading of the signature.
      ['bare', 'dynamic'],
    ],
  );
});
