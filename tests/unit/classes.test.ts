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
  InstanceOf,
  MethodCall,
  NewExpr,
  ObjectLiteral,
  Statement,
} from '../../src/hir/nodes.ts';
import { verifyHir } from '../../src/hir/verify.ts';
import { lowerSource, requireInit } from './helpers.ts';

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

test('instanceof names the class and keeps the target an expression', () => {
  const expr = lastExpression(`${POINT}const p = new Point(1, 2);
console.log(p instanceof Point);
`);
  const arg = (expr as Extract<Expression, { kind: 'console-log' }>).args[0] as InstanceOf;
  assert.equal(arg.kind, 'instanceof');
  assert.equal(
    arg.className,
    'Point',
    'the class is a NAME -- there is no class value to evaluate',
  );
  assert.equal(arg.target.kind, 'identifier');
  assert.equal(arg.type.kind, 'boolean', 'the answer is a boolean whatever the target is');
});

test('the target of instanceof is evaluated, not just named', () => {
  // `new Point(1,2) instanceof Point` has to run the constructor: the test is on the VALUE, and a
  // shape that stored a class name on both sides would let the emitter skip the allocation.
  const expr = lastExpression(`${POINT}console.log(new Point(1, 2) instanceof Point);\n`);
  const arg = (expr as Extract<Expression, { kind: 'console-log' }>).args[0] as InstanceOf;
  assert.equal(arg.target.kind, 'new');
});

const CHAIN = `class Base {
  a: number;
  b: number;
  constructor(a: number, b: number) { this.a = a; this.b = b; }
  describe(): string { return 'base'; }
}
class Mid extends Base {
  c = this.a + 1;
  constructor(a: number) { super(a, 2); }
}
class Leaf extends Mid {
  d: boolean;
  constructor() { super(1); this.d = true; }
}
`;

function classNamed(code: string, name: string): ClassDeclaration {
  const found = statements(code).find(
    (s): s is ClassDeclaration => s.kind === 'class-declaration' && s.name === name,
  );
  assert.ok(found !== undefined, `source should declare ${name}`);
  return found;
}

test("a subclass's slots begin with its base's, in the base's own order", () => {
  const leaf = classNamed(`${CHAIN}const l = new Leaf();\nconsole.log(l.d);\n`, 'Leaf');
  // Not "own fields then inherited", which is the order the CHECKER hands back. The prefix is the
  // whole point: a base-typed read of a Leaf resolves the same index it would on a Base.
  assert.deepEqual(
    leaf.fields.map((f) => f.name),
    ['a', 'b', 'c', 'd'],
  );
  assert.equal(leaf.base, 'Mid', 'the immediate base, which is what the descriptor links to');
});

test('an inherited method call names the class that DECLARES it', () => {
  const expr = lastExpression(`${CHAIN}const l = new Leaf();\nconsole.log(l.describe());\n`);
  const call = (expr as Extract<Expression, { kind: 'console-log' }>).args[0];
  assert.equal(call?.kind, 'method-call');
  const method = call as Extract<Expression, { kind: 'method-call' }>;
  assert.equal(
    method.className,
    'Base',
    'Leaf has no describe of its own -- naming Leaf would name a function that does not exist',
  );
  assert.equal(method.target.type.kind, 'object');
  assert.deepEqual((method.target.type as { bases: readonly string[] }).bases, ['Mid', 'Base']);
});

test('field initializers run AFTER super, never before it', () => {
  // `c = this.a + 1` reads a field the BASE constructor wrote. Prepending the prologue at index 0
  // would read an empty slot, which is exactly the bug the ordering exists to prevent.
  const mid = classNamed(`${CHAIN}const l = new Leaf();\nconsole.log(l.c);\n`, 'Mid');
  const body = mid.ctor?.fn.body.statements;
  assert.equal(body?.[0]?.kind, 'super-call');
  assert.equal(body?.[1]?.kind, 'field-assignment');
});

test('a derived class with no constructor gets the implicit one, forwarding to super', () => {
  const plain = classNamed(
    `${CHAIN}class Plain extends Mid {}\nconst p = new Plain(7);\nconsole.log(p.c);\n`,
    'Plain',
  );
  const body = plain.ctor?.fn.body.statements;
  assert.equal(body?.length, 1, 'nothing of its own to do -- but the base still has to run');
  assert.equal(body?.[0]?.kind, 'super-call');
  assert.deepEqual(
    plain.ctor?.fn.params.map((p) => p.name).slice(1),
    ['a'],
    "the nearest declared ancestor constructor's parameters, forwarded by name",
  );
});

const STATICS = `class Counter {
  static count = 0;
  static label = 'c';
  static bump(): void { Counter.count++; }
  n: number;
  constructor(n: number) { this.n = n; }
}
`;

test('a static is a binding, not a slot: it never reaches the layout', () => {
  const cls = classNamed(`${STATICS}console.log(Counter.count);\n`, 'Counter');
  assert.deepEqual(
    cls.fields.map((f) => f.name),
    ['n'],
    'an instance carries its own fields only -- a static belongs to no instance',
  );
  assert.deepEqual(
    cls.methods.map((m) => m.name),
    [],
    'a static method takes no receiver, so it is not a member function',
  );
  assert.deepEqual(
    cls.statics.map((d) => d.name),
    ['Counter.count', 'Counter.label', 'Counter.bump'],
    'the name carries the class, which is what makes it unspellable in source',
  );
  assert.deepEqual(
    cls.statics.map((d) => d.declKind),
    ['let', 'let', 'const'],
    'a static field can be reassigned; a static method cannot',
  );
});

test('reading a static lowers to an identifier, not a field access', () => {
  const expr = lastExpression(`${STATICS}console.log(Counter.count);\n`);
  const arg = (expr as Extract<Expression, { kind: 'console-log' }>).args[0];
  assert.equal(arg?.kind, 'identifier');
  assert.equal((arg as Extract<Expression, { kind: 'identifier' }>).name, 'Counter.count');
});

test('an inherited static resolves to the ONE binding the base declared', () => {
  // `Sub.count` and `Counter.count` are the same static. Mangling by the receiver's spelling would
  // give them two bindings, and a write through one would be invisible through the other.
  const expr = lastExpression(`${STATICS}class Sub extends Counter {}
console.log(Sub.count);
`);
  const arg = (expr as Extract<Expression, { kind: 'console-log' }>).args[0];
  assert.equal((arg as Extract<Expression, { kind: 'identifier' }>).name, 'Counter.count');
});

test('writing a static is an assignment to that binding, with nothing hoisted', () => {
  // `C.count++` reads and writes a plain binding: there is no place to evaluate exactly once, so
  // it takes the identifier path rather than the read-once machinery a field write needs.
  const stmts = statements(`${STATICS}Counter.count += 2;\n`);
  const write = stmts.at(-1);
  assert.equal(write?.kind, 'assignment');
  assert.equal((write as Extract<Statement, { kind: 'assignment' }>).target, 'Counter.count');
});

const PRIVATE = `class Vault {
  #secret: number = 1;
  open: string = 'o';
  static #next: number = 0;
  #reveal(): number { return this.#secret; }
  peek(): number { return this.#reveal(); }
  static take(): number { return Vault.#next; }
}
`;

test('a #private member is an ordinary slot: privacy is a printing rule, not a layout rule', () => {
  const cls = classNamed(`${PRIVATE}console.log(new Vault().peek());\n`, 'Vault');
  assert.deepEqual(
    cls.fields.map((f) => f.name),
    ['#secret', 'open'],
    'the # is carried into the slot name -- it is the whole signal util.inspect reads',
  );
  assert.deepEqual(
    cls.methods.map((m) => m.name),
    ['#reveal', 'peek'],
    'a #private method dispatches like any other, so it is a member function like any other',
  );
  assert.deepEqual(
    cls.statics.map((d) => d.name),
    ['Vault.#next', 'Vault.take'],
    'a #private static is a binding whose mangled name is doubly unspellable',
  );
});

test('a #private field access indexes its slot like a public one', () => {
  // `#secret` is slot 0 because it is declared first; nothing about privacy reorders the layout.
  const cls = classNamed(`${PRIVATE}console.log(new Vault().peek());\n`, 'Vault');
  const reveal = cls.methods.find((m) => m.name === '#reveal');
  const ret = reveal?.fn.body.statements[0];
  assert.equal(ret?.kind, 'return-statement');
  const value = (ret as Extract<Statement, { kind: 'return-statement' }>).value;
  assert.equal(value?.kind, 'field-access');
  assert.equal((value as FieldAccess).slot, 0);
});

const OVERRIDE = `class A {
  m(): number { return 1; }
  k(): number { return 2; }
}
class B extends A {
  override m(): number { return 3; }
}
`;

test('an override keeps the base slot and changes only the entry', () => {
  const code = `${OVERRIDE}console.log(new B().m());\n`;
  assert.deepEqual(
    classNamed(code, 'A').vtable,
    [
      { name: 'm', className: 'A' },
      { name: 'k', className: 'A' },
    ],
    'the base implements both of its own methods',
  );
  assert.deepEqual(
    classNamed(code, 'B').vtable,
    [
      { name: 'm', className: 'B' },
      { name: 'k', className: 'A' },
    ],
    'same names, same order, and only the overridden entry moves to the subclass',
  );
});

test('a class nothing overrides has no table at all', () => {
  // Not an optimization detail: a direct call is what rung 6a emits, and it stays exactly that.
  const cls = classNamed(
    'class C {\n  m(): number { return 1; }\n}\nconsole.log(new C().m());\n',
    'C',
  );
  assert.deepEqual(cls.vtable, []);
});

test('overriding makes the call virtual for the WHOLE family, base-typed calls included', () => {
  const code = `${OVERRIDE}const a: A = new B();\nconsole.log(a.m());\n`;
  const call = (lastExpression(code) as Extract<Expression, { kind: 'console-log' }>).args[0];
  assert.equal(call?.kind, 'method-call');
  assert.equal((call as MethodCall).dispatch, 'virtual');
  assert.equal((call as MethodCall).slot, 0);
  // The class named is still the one that DECLARES the method for the receiver's static type --
  // the slot is what the call indexes, and the name is what a direct call would have used.
  assert.equal((call as MethodCall).className, 'A');
});

test('a method nothing overrides stays direct even in an overriding family', () => {
  const code = `${OVERRIDE}const a: A = new B();\nconsole.log(a.k());\n`;
  const call = (lastExpression(code) as Extract<Expression, { kind: 'console-log' }>).args[0];
  assert.equal((call as MethodCall).dispatch, 'direct');
});

test('super.m() is direct even though every other call to m is virtual', () => {
  // Skipping the override is what `super` means: a virtual call here would find the override
  // again and recur forever.
  const code = `class A {
  m(): number { return 1; }
}
class B extends A {
  override m(): number { return super.m() + 1; }
}
console.log(new B().m());
`;
  const b = classNamed(code, 'B');
  const body = b.methods.find((m) => m.name === 'm')?.fn.body.statements[0];
  const value = (body as Extract<Statement, { kind: 'return-statement' }>).value;
  assert.equal(value?.kind, 'binary-op');
  const left = (value as Extract<Expression, { kind: 'binary-op' }>).left;
  assert.equal(left.kind, 'method-call');
  assert.equal((left as MethodCall).dispatch, 'direct');
  assert.equal((left as MethodCall).className, 'A');
  // The receiver is THIS object, not a new one: only the function differs.
  assert.equal((left as MethodCall).target.kind, 'identifier');
});

const ACCESSORS = `class C {
  raw: number = 0;
  get value(): number { return this.raw; }
  set value(v: number) { this.raw = v; }
  get twice(): number { return this.raw * 2; }
}
`;

test('an accessor is a pair of methods under an unspellable name, and never a slot', () => {
  const cls = classNamed(`${ACCESSORS}console.log(new C().value);\n`, 'C');
  assert.deepEqual(
    cls.fields.map((f) => f.name),
    ['raw'],
    'the property `value` occupies no slot -- which is why util.inspect never prints it',
  );
  assert.deepEqual(
    cls.methods.map((m) => m.name),
    ['get value', 'set value', 'get twice'],
    'the space is what makes the name unspellable, the same trick the receiver parameter uses',
  );
});

test('reading an accessor lowers to a call, not a field access', () => {
  const expr = lastExpression(`${ACCESSORS}console.log(new C().value);\n`);
  const arg = (expr as Extract<Expression, { kind: 'console-log' }>).args[0];
  assert.equal(arg?.kind, 'method-call');
  assert.equal((arg as MethodCall).method, 'get value');
  assert.deepEqual((arg as MethodCall).args, []);
});

test('writing an accessor lowers to a call taking the value, and nothing is hoisted', () => {
  // A plain `=` reads nothing, so there is no place to evaluate exactly once and no temporary.
  const stmts = statements(`${ACCESSORS}const c = new C();\nc.value = 7;\n`);
  const write = stmts.at(-1);
  assert.equal(write?.kind, 'expression-statement');
  const call = (write as Extract<Statement, { kind: 'expression-statement' }>).expression;
  assert.equal(call.kind, 'method-call');
  assert.equal((call as MethodCall).method, 'set value');
  assert.equal((call as MethodCall).args.length, 1);
});

const LITERAL = `const p = { x: 1, y: 'two' };\n`;

/** The type name of every declared value -- for a literal, the structural name of its shape. */
function shapeNames(stmts: readonly Statement[]): string[] {
  return stmts
    .filter((s): s is Extract<Statement, { kind: 'declaration' }> => s.kind === 'declaration')
    .map((s) => {
      assert.ok(s.value !== undefined);
      return (s.value.type as { name: string }).name;
    });
}

test('an object literal is entries in written order, which is what makes them slots', () => {
  // The written order is the ONLY thing that decides the layout: there is no declaration to read
  // it from, so a reordering here is a silently different object with the same printout.
  const expr = lastExpression(`${LITERAL}console.log(p);\n`);
  const arg = (expr as Extract<Expression, { kind: 'console-log' }>).args[0];
  assert.equal(arg?.kind, 'identifier');
  const decl = statements(`${LITERAL}console.log(p);\n`)[0];
  assert.equal(decl?.kind, 'declaration');
  const value = (decl as Extract<Statement, { kind: 'declaration' }>).value;
  assert.equal(value?.kind, 'object-literal');
  assert.deepEqual(
    (value as ObjectLiteral).entries.map((e) => e.name),
    ['x', 'y'],
  );
});

test('the shape name is structural, so two identical literals are ONE descriptor', () => {
  const stmts = statements(
    `const a = { x: 1, y: 'two' };\nconst b = { x: 3, y: 'four' };\nconsole.log(a.x + b.x);\n`,
  );
  assert.deepEqual(shapeNames(stmts), ['{x: number, y: string}', '{x: number, y: string}']);
});

test('a different key order is a different shape, not a permutation of the same one', () => {
  const stmts = statements(
    `const a = { x: 1, y: 2 };\nconst b = { y: 3, x: 4 };\nconsole.log(a.x + b.x);\n`,
  );
  const names = shapeNames(stmts);
  assert.notEqual(names[0], names[1]);
});

test('a field read on a literal is the same slot index a class instance would use', () => {
  const expr = lastExpression(`${LITERAL}console.log(p.y);\n`);
  const arg = (expr as Extract<Expression, { kind: 'console-log' }>).args[0];
  assert.equal(arg?.kind, 'field-access');
  assert.equal((arg as FieldAccess).slot, 1);
});

test('a nested literal is an entry value with a shape of its own', () => {
  const decl = statements(`const t = { c: { d: 1 } };\nconsole.log(t.c.d);\n`)[0];
  const value = (decl as Extract<Statement, { kind: 'declaration' }>).value as ObjectLiteral;
  const inner = value.entries[0]?.value;
  assert.ok(inner !== undefined);
  assert.equal(inner.kind, 'object-literal');
  assert.equal((inner.type as { name: string }).name, '{d: number}');
  assert.equal((value.type as { name: string }).name, '{c: {d: number}}');
});

test('an empty literal takes the dynamic path so it can grow', () => {
  const decl = statements('const e = {};\nconsole.log(e);\n')[0];
  const value = requireInit(decl as Extract<Statement, { kind: 'declaration' }>);
  assert.equal(value.kind, 'dyn-object-literal');
  assert.deepEqual((value as { entries: readonly unknown[] }).entries, []);
});
