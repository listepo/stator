/* Class lowering — the parts the golden tests cannot see.
 *
 * A golden test proves the program PRINTS what Node prints. It cannot prove why: that slot 1 is
 * slot 1 rather than slot 0, that `this` became a parameter instead of a new node kind, that a
 * field initializer moved into the constructor rather than being emitted twice, or that a method
 * with a side-effecting receiver evaluates it once. Each of those is an invariant the emitter
 * depends on and a plausible refactor could break while the output still matched.
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type {
  Block,
  ClassDeclaration,
  Expression,
  FieldAccess,
  FieldAssignment,
  MethodCall,
  NewExpr,
  Statement,
} from '../../src/hir/nodes.ts';
import { verifyHir } from '../../src/hir/verify.ts';
import { lowerSource } from './helpers.ts';

function statements(code: string): readonly Statement[] {
  const { module, diagnostics } = lowerSource(code);
  assert.deepEqual(
    diagnostics.map((d) => d.code),
    [],
    'lowering should be clean',
  );
  // Every source here also has to survive the verifier: the slot a FieldAccess stores is checked
  // against the layout it claims to index, which is the check that would catch a wrong slot.
  assert.deepEqual(
    verifyHir(module).map((p) => p.code),
    [],
    'HIR should verify clean',
  );
  return module.statements;
}

function classOf(code: string): ClassDeclaration {
  const found = statements(code).find((s) => s.kind === 'class-declaration');
  assert.ok(found !== undefined, 'source should declare a class');
  return found;
}

/** The expression of the last expression statement — where these sources put the thing under test. */
function lastExpression(code: string): Expression {
  const stmt = statements(code).at(-1);
  assert.equal(stmt?.kind, 'expression-statement');
  return (stmt as Extract<Statement, { kind: 'expression-statement' }>).expression;
}

const POINT = `class Point {
  x: number;
  y: number;
  constructor(x: number, y: number) { this.x = x; this.y = y; }
  norm(): number { return this.x + this.y; }
}
`;

test('declaration order is slot order, and it is what FieldAccess indexes', () => {
  const decl = classOf(`${POINT}const p = new Point(1, 2);\n`);
  assert.deepEqual(
    decl.fields.map((f) => f.name),
    ['x', 'y'],
  );

  const read = lastExpression(`${POINT}const p = new Point(1, 2);\nconsole.log(p.y);\n`);
  assert.equal(read.kind, 'console-log');
  const arg = (read as Extract<Expression, { kind: 'console-log' }>).args[0] as FieldAccess;
  assert.equal(arg.kind, 'field-access');
  assert.equal(arg.field, 'y');
  assert.equal(arg.slot, 1, 'the second declared field is slot 1');
});

test('`this` is a parameter, not a node kind: every member takes the receiver first', () => {
  const decl = classOf(`${POINT}const p = new Point(1, 2);\n`);
  const ctor = decl.ctor;
  assert.ok(ctor !== undefined);
  assert.equal(ctor.fn.params.length, 3, 'receiver plus the two declared parameters');
  const receiverParam = ctor.fn.params[0];
  assert.ok(receiverParam !== undefined);
  assert.equal(receiverParam.type.kind, 'object');
  assert.equal(
    (receiverParam.type as { name: string }).name,
    'Point',
    'the receiver is typed as the class, which is what the verifier checks',
  );
  assert.deepEqual(
    ctor.fn.params.slice(1).map((p) => p.name),
    ['x', 'y'],
  );

  // The receiver name is unspellable, so it can never collide with a user binding.
  const receiver = receiverParam.name;
  assert.ok(!/^[A-Za-z_$]/.test(receiver), `receiver name '${receiver}' must not be spellable`);

  const method = decl.methods[0];
  assert.equal(method?.name, 'norm');
  assert.equal(method?.fn.params.length, 1, 'a nullary method still takes the receiver');
});

test('a field initializer moves into the constructor, in declaration order', () => {
  const decl = classOf(`class C {
  a = 1;
  b = 2;
  constructor() { this.a = 3; }
}
const c = new C();
`);
  const body = decl.ctor?.fn.body.statements ?? [];
  const writes = body.filter((s): s is FieldAssignment => s.kind === 'field-assignment');
  assert.deepEqual(
    writes.map((w) => w.slot),
    [0, 1, 0],
    'both initializers run, in order, before the constructor body assigns a again',
  );
});

test('a class with initializers and no constructor gets one to hold them', () => {
  const decl = classOf(`class C {
  n = 0;
}
const c = new C();
`);
  assert.ok(decl.ctor !== undefined, 'a synthesized constructor carries the initializers');
  assert.equal(decl.ctor.fn.params.length, 1, 'it takes the receiver and nothing else');
  assert.equal(decl.ctor.fn.body.statements.length, 1);
});

test('a class with neither a constructor nor an initializer gets no constructor at all', () => {
  const decl = classOf(`class C {
  m(): number { return 1; }
}
const c = new C();
`);
  assert.equal(decl.ctor, undefined, 'nothing to run means nothing to emit');
});

test('a method call names the class, so the emitter can call it directly', () => {
  const expr = lastExpression(`${POINT}const p = new Point(1, 2);\np.norm();\n`) as MethodCall;
  assert.equal(expr.kind, 'method-call');
  assert.equal(expr.className, 'Point');
  assert.equal(expr.method, 'norm');
  assert.equal(expr.target.kind, 'identifier', 'the receiver is a value; the method is not');
  assert.equal(expr.args.length, 0, 'the receiver is NOT in args -- it becomes argument zero');
});

test('new carries the class name and the instance type, not a callee expression', () => {
  const decl = statements(`${POINT}const p = new Point(1, 2);\n`).at(-1);
  assert.equal(decl?.kind, 'declaration');
  const created = (decl as Extract<Statement, { kind: 'declaration' }>).value as NewExpr;
  assert.equal(created.kind, 'new');
  assert.equal(created.className, 'Point');
  assert.equal(created.type.kind, 'object');
  assert.equal(created.args.length, 2);
});

test('a read-modify-write on a field evaluates the receiver once', () => {
  // `f().x += 1` must call `f` a single time; the fold names the receiver twice, so it is hoisted.
  const stmt = statements(`${POINT}function f(): Point { return new Point(1, 2); }
f().x += 1;
`).at(-1);
  assert.equal(stmt?.kind, 'block', 'the temporary and the write are one statement');
  const block = stmt as Block;
  assert.equal(block.statements.length, 2);
  assert.equal(block.statements[0]?.kind, 'declaration');
  const write = block.statements[1] as FieldAssignment;
  assert.equal(write.kind, 'field-assignment');
  assert.equal(write.target.kind, 'identifier', 'the write refers to the hoisted temporary');
});

test('a plain field assignment hoists nothing: it reads neither half', () => {
  const stmt = statements(`${POINT}function f(): Point { return new Point(1, 2); }
f().x = 1;
`).at(-1);
  assert.equal(stmt?.kind, 'field-assignment', 'no block, because there is no temporary');
  assert.equal(
    (stmt as FieldAssignment).target.kind,
    'call',
    'the call stays where it stands, evaluated once by construction',
  );
});

test('a field named length is a slot, not the array intrinsic', () => {
  const read = lastExpression(`class Box {
  length: number;
  constructor(n: number) { this.length = n; }
}
const b = new Box(3);
console.log(b.length);
`);
  const arg = (read as Extract<Expression, { kind: 'console-log' }>).args[0] as FieldAccess;
  assert.equal(arg.kind, 'field-access', 'not array-length, and not string-length');
  assert.equal(arg.slot, 0);
});

test('two classes with identical fields are different types', () => {
  const { module, diagnostics } = lowerSource(`class A {
  v: number;
  constructor(v: number) { this.v = v; }
}
class B {
  v: number;
  constructor(v: number) { this.v = v; }
}
const a = new A(1);
const b = new B(2);
`);
  assert.deepEqual(
    diagnostics.map((d) => d.code),
    [],
  );
  const types = module.statements
    .filter((s): s is Extract<Statement, { kind: 'declaration' }> => s.kind === 'declaration')
    .map((s) => s.type);
  assert.equal(types[0]?.kind, 'object');
  assert.equal(types[1]?.kind, 'object');
  assert.notEqual(
    (types[0] as { name: string }).name,
    (types[1] as { name: string }).name,
    'nominal identity: same shape, different class',
  );
});
