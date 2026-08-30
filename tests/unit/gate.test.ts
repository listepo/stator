/* The frontend gate (src/frontend/gate.ts) had no direct unit tests before this file — every case
 * was reached only indirectly, through `explain`/`build` in the decision-test corpus. That leaves
 * exactly the kind of rule this gate depends on unverified in isolation: a POSITION test, not a
 * syntax test, which a decision test exercises only by accident of what example it happens to use.
 *
 * `gateProgram` takes a real `ts.Program`; `program()` below builds one exactly the way
 * `stator explain`/`build` would, so a passing test here is a claim about the actual gate. */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { gateProgram } from '../../src/frontend/gate.ts';
import { createProgram } from './helpers.ts';

function codesFor(source: string, mode: 'ts' | 'js' = 'ts', fileName?: string): string[] {
  const { program } = createProgram(source, fileName ?? (mode === 'js' ? '/test.js' : '/test.ts'));
  return gateProgram(program, mode).map((d) => d.code);
}

// `x++`, `--x`, `x += e` all read-then-write-then-produce-a-value. Where the value is used they
// need a temporary the fold cannot give them (plan-notes 43); where it is discarded they collapse
// to a plain Assignment. The gate is the layer that decides which case a program is in.
void test('++ and -- are accepted where their value is discarded', () => {
  assert.deepEqual(codesFor('let x: number = 0;\nx++;'), []);
  assert.deepEqual(codesFor('let x: number = 0;\n--x;'), []);
  assert.deepEqual(codesFor('for (let i: number = 0; i < 1; i++) { }'), []);
});

void test('++ and -- are refused where their value is USED', () => {
  // Both read the value `x` had (postfix) or has (prefix) and bind it — exactly the shape the HIR
  // has no node for. A silent accept here would reach the lowering with nothing to lower it to.
  assert.deepEqual(codesFor('let x: number = 0;\nlet y: number = x++;'), ['STA1214']);
  assert.deepEqual(codesFor('let x: number = 0;\nlet y: number = --x;'), ['STA1214']);
});

void test('compound assignment is accepted where its value is discarded, refused where used', () => {
  assert.deepEqual(codesFor('let x: number = 0;\nx += 1;'), []);
  assert.deepEqual(codesFor('for (let i: number = 0; i < 1; i += 1) { }'), []);
  assert.deepEqual(codesFor('let x: number = 0;\nlet y: number = (x += 1);'), ['STA1214']);
});

void test('compound assignment to anything but a bare identifier is deferred, not accepted', () => {
  // No object model exists yet for the target to reach the fold soundly, so `.length` — the one
  // property this subset already exposes — has to be refused rather than silently miscompiled.
  assert.deepEqual(codesFor('let s: string = "x";\ns.length += 1;'), ['STA1214']);
});

// A label exists only to be named by `break`/`continue`, and only a loop or a switch is modelled
// with somewhere to put one (docs/HIR.md). `foo: { }` is legal JavaScript with nothing to bind to.
void test('a label on a loop or switch is accepted; a label on anything else is deferred', () => {
  assert.deepEqual(codesFor('outer: while (false) { break outer; }'), []);
  assert.deepEqual(codesFor('let x: number = 0;\nouter: switch (x) { }'), []);
  assert.deepEqual(codesFor('outer: { }'), ['STA1214']);
});

// `for`, `for-of`, `for-in` all parse as loops, but they are three different things and their
// diagnostics have to say so. Conflating them ("for loops is not yet supported") would misname
// what is actually missing (plan-notes 44). for-of over an ARRAY landed with rung 5; for-of over
// anything else is the iterator protocol, and for-in needs the object model.
void test('for-of and for-in report distinctly from the for loop they are not', () => {
  assert.deepEqual(codesFor('for (const x of [1, 2]) { }'), []);
  assert.deepEqual(codesFor("for (const c of 'ab') { }"), ['STA1214']);
  assert.deepEqual(codesFor('for (const x in {}) { }'), ['STA1214']);
  assert.deepEqual(codesFor('for (let i: number = 0; i < 1; i++) { }'), []);
});

// Index access is admitted only where the target is genuinely an array. `s[0]` and `o['k']` are
// the same syntax reaching a different runtime operation, and neither has an HIR node yet.
void test('index access is accepted on an array and not-yet on anything else', () => {
  assert.deepEqual(codesFor('const a: number[] = [1];\nconsole.log(a[0]);'), []);
  assert.deepEqual(codesFor("const s: string = 'ab';\nconsole.log(s[0]);"), ['STA1214']);
  // A hole and a spread are rejected in their own right: a dense array cannot be absent, and a
  // spread needs the iterator protocol.
  assert.deepEqual(codesFor('const a: number[] = [1, , 3];'), ['STA1214']);
  assert.deepEqual(codesFor('const a: number[] = [1];\nconst b: number[] = [...a];'), ['STA1214']);
});

void test('switch, case, default and do/while are all accepted syntax', () => {
  assert.deepEqual(
    codesFor('let x: number = 0;\nswitch (x) { case 1: break; default: break; }'),
    [],
  );
  assert.deepEqual(codesFor('let x: number = 0;\ndo { x++; } while (x < 1);'), []);
});

void test('try/catch/finally and throw are accepted; destructured catch bindings are not', () => {
  assert.deepEqual(codesFor("try { throw 'boom'; } catch { console.log('handled'); }"), []);
  assert.deepEqual(codesFor("try { throw 'boom'; } catch (e) { console.log(typeof e); }"), []);
  assert.deepEqual(codesFor('try { console.log(1); } finally { console.log(2); }'), []);
  // A destructured binding names more than one place for one value, which the HIR's one-name
  // catch binding cannot carry -- and the caught value is Unknown anyway, so the destructure
  // would need narrowing first.
  assert.deepEqual(codesFor('try { throw 1; } catch ({ message }) { console.log(message); }'), [
    'STA1214',
  ]);
});

// `var` is banned in ts mode BY DESIGN (STA1104, a 'never' code, no phase) — hoisting with a TDZ
// is the dynamic-scoping behaviour strict mode exists to exclude. In js mode it is merely not
// implemented yet, which is a different class of diagnostic entirely (docs/DIAGNOSTICS.md).
void test('var is a permanent rejection in ts mode, but only "not yet" in js mode', () => {
  assert.deepEqual(codesFor('var x = 1;'), ['STA1104']);
  assert.deepEqual(codesFor('var x = 1;', 'js'), ['STA1214']);
});

// The HIR's Declaration always carries exactly one name and one initializer (docs/HIR.md) — both
// of these parse as valid TypeScript but have no HIR shape to lower into yet.
void test('a declaration missing an initializer, or destructuring one, are both deferred', () => {
  assert.deepEqual(codesFor('let x: number;'), ['STA1214']);
  assert.deepEqual(codesFor('let [a, b]: [number, number] = [1, 2];'), ['STA1214']);
});

// Mirrors the compound-assignment-to-non-identifier test above, but for plain `=`: HIR Assignment
// only ever targets a bare name, so `obj.x = 1` needs an object model this subset doesn't have.
void test('plain assignment to anything but a bare identifier is deferred, not accepted', () => {
  assert.deepEqual(codesFor('let s: string = "x";\ns.length = 2;'), ['STA1214']);
});

// Loose equality is accepted alongside strict equality (docs/NUMERIC.md §6.3): its ToPrimitive
// half is unreachable while every value is a primitive, so it needs no object model to be sound.
void test('loose equality (== and !=) is accepted, not deferred pending an object model', () => {
  assert.deepEqual(codesFor('let x: number = 1;\nconsole.log(x == 1);'), []);
  assert.deepEqual(codesFor('let x: number = 1;\nconsole.log(x != 2);'), []);
});

// `.length` is the one gate rule that consults the type checker instead of syntax alone: the same
// PropertyAccessExpression is legal on a string and meaningless on anything else, so only the
// checker's answer -- not the shape of the code -- can tell the two apart.
void test('.length is accepted on a string type and deferred on anything else', () => {
  assert.deepEqual(codesFor('let s: string = "hi";\nconsole.log(s.length);'), []);
  assert.deepEqual(codesFor('let b: boolean = true;\nconsole.log(b.length);'), ['STA1214']);
});

// A global the compiler does not model is the case where the gate accepting too much cost the
// COMPILER its own invariant rather than the user a feature: the lowering binds only declarations
// it lowers, so an accepted `String` reached `STA4035 used before declaration` — an internal error
// raised by legal source. These tests are position tests, and every one of them once passed the
// gate (plan-notes 61).
void test('a global the compiler does not model is a not-yet, never an internal error', () => {
  assert.deepEqual(codesFor('const s: string = String(1);\nconsole.log(s);'), ['STA1214']);
  assert.deepEqual(codesFor('console.log(parseInt("4"));'), ['STA1214']);
  // Declared nowhere at all rather than in a lib file — the checker synthesizes it, and
  // `globalThis` slipped through a valueDeclaration-based test.
  assert.deepEqual(codesFor('const g = globalThis;\nconsole.log(1);'), ['STA1214']);
  // `NaN` sat in this list until Task 4.2's Math slice gave it a lowering (a number literal,
  // like `undefined`'s undefined-literal) — the exact lift the plan's Task 4.2 note promises.
  assert.deepEqual(codesFor('console.log(NaN);'), []);
});

void test('the three spellings that only MENTION a global name still pass', () => {
  // `undefined` is the one global with a lowering: it answers with an undefined-literal, and the
  // gate exempts it by name so both sides agree on the same single exception.
  assert.deepEqual(codesFor('const u = undefined;\nconsole.log(u);'), []);
  // A property NAME is answered by the object's shape, never by scope; that `length` resolves to a
  // lib declaration is an accident of where the type came from.
  assert.deepEqual(codesFor('const s: string = "ab";\nconsole.log(s.length);'), []);
  assert.deepEqual(codesFor('console.log([1, 2].length);'), []);
  // `console` is the receiver of the one call the compiler models itself. gateCall vets the whole
  // expression; the walker descends into the callee anyway.
  assert.deepEqual(codesFor('console.log(1);'), []);
  // A type position erases, so there is nothing to lower.
  assert.deepEqual(codesFor('const xs: Array<number> = [1];\nconsole.log(xs.length);'), []);
});

void test('a user binding that shadows a global name is a user binding', () => {
  // The rule is "declared nowhere in the module", not "spelled like a global": the check is over
  // where the symbol's declarations LIVE, so a name declared in user code stays a normal binding
  // even when a lib global answers to it too.
  assert.deepEqual(
    codesFor(
      'function f(): number {\n  const String: number = 1;\n  return String;\n}\nconsole.log(f());',
    ),
    [],
  );
});

void test('inheritance, overriding and super.m() are accepted; a re-declared FIELD is not', () => {
  const chain = `class A {\n  n = 1;\n  m(): number {\n    return this.n;\n  }\n}\n`;
  assert.deepEqual(
    codesFor(`${chain}class B extends A {\n  k = 2;\n}\nconsole.log(new B().m());`),
    [],
  );
  assert.deepEqual(
    codesFor(
      `${chain}class B extends A {\n  override m(): number {\n    return 2;\n  }\n}\nconsole.log(new B().m());`,
    ),
    [],
  );
  assert.deepEqual(
    codesFor(
      `${chain}class B extends A {\n  override m(): number {\n    return super.m() + 1;\n  }\n}\nconsole.log(new B().m());`,
    ),
    [],
  );
  // A field is a SLOT, and a subclass re-declaring one would be two declarations of that slot with
  // two initializers racing for it. Overriding solves the method problem, not this one.
  assert.deepEqual(
    codesFor(`${chain}class B extends A {\n  n = 2;\n}\nconsole.log(new B().m());`),
    ['STA1214'],
  );
});

void test('a method table is a file-scope constant, so an override inside a function is not', () => {
  // A class declared in a function may have methods that CAPTURE, and a captured environment is
  // per evaluation of the declaration -- there is no one table for the class to point at.
  const nested = `function f(): number {\n  class A {\n    m(): number {\n      return 1;\n    }\n  }\n  class B extends A {\n    override m(): number {\n      return 2;\n    }\n  }\n  return new B().m();\n}\nconsole.log(f());`;
  assert.deepEqual(codesFor(nested), ['STA1214']);
});

void test('super is a marker on two forms, not a value', () => {
  const chain = `class A {\n  n = 1;\n  m(): number {\n    return this.n;\n  }\n}\n`;
  // `super.n` is the same SLOT as `this.n` -- the spelling would promise a distinction the layout
  // cannot make -- and `super.m` as a value would need a bound method object nothing builds.
  assert.deepEqual(
    codesFor(
      `${chain}class B extends A {\n  k(): number {\n    return super.n;\n  }\n}\nconsole.log(new B().k());`,
    ),
    ['STA1214'],
  );
});

void test('a derived constructor must open with super(...)', () => {
  // Not style: field initializers are inserted after the super call, and every field the base
  // declares is unwritten until it runs. A constructor that does anything first can read them.
  const base = 'class A {\n  n: number;\n  constructor(n: number) {\n    this.n = n;\n  }\n}\n';
  assert.deepEqual(
    codesFor(
      `${base}class B extends A {\n  constructor() {\n    super(1);\n  }\n}\nconsole.log(new B().n);`,
    ),
    [],
  );
  assert.deepEqual(
    codesFor(
      `${base}class B extends A {\n  constructor() {\n    console.log(0);\n    super(1);\n  }\n}\nconsole.log(new B().n);`,
    ),
    ['STA1214'],
  );
});

void test('statics are accepted; what has no class object to read is not', () => {
  const cls = 'class C {\n  static n = 1;\n  static m(): number {\n    return C.n;\n  }\n}\n';
  assert.deepEqual(codesFor(`${cls}console.log(C.m());`), []);
  // A static initialization block runs statements against the class OBJECT, and `this` inside a
  // static is that object. There is no class object here -- a static is a plain binding.
  assert.deepEqual(
    codesFor('class C {\n  static n = 1;\n  static {\n    C.n = 2;\n  }\n}\nconsole.log(C.n);'),
    ['STA1214'],
  );
  assert.deepEqual(
    codesFor(
      'class C {\n  static n = 1;\n  static m(): number {\n    return this.n;\n  }\n}\nconsole.log(C.m());',
    ),
    ['STA1214'],
  );
  // The rest of the class object -- `C.name`, `C.prototype` -- is a member no static declares.
  assert.deepEqual(codesFor('class C {\n  static n = 1;\n}\nconsole.log(C.name);'), ['STA1214']);
});

void test('this is gated, not left to the lowering', () => {
  // `this` is a TOKEN, and the gate short-circuits tokens. It is exempted by name, without which
  // its case is dead code and `this` outside a class reaches an internal error instead.
  assert.deepEqual(codesFor('console.log(this);'), ['STA1214']);
  // A field initializer is a `this` position though it is inside no function: the lowering moves
  // it into the constructor, where the receiver is a parameter.
  assert.deepEqual(
    codesFor('class C {\n  a = 1;\n  b = this.a + 1;\n}\nconsole.log(new C().b);'),
    [],
  );
});

void test('#private members are accepted; sharing a name down the chain is not', () => {
  assert.deepEqual(
    codesFor(`class C {
  #n: number = 0;
  static #m: number = 0;
  #read(): number { return this.#n; }
  get(): number { return this.#read() + C.#m; }
}
console.log(new C().get());
`),
    [],
    'a #private field, method and static are ordinary members with an unspellable name',
  );
  // One name, one slot: two #private `#n`s in one chain are two distinct slots that a layout
  // keyed by name cannot hold apart, so the gate refuses rather than merging them.
  assert.deepEqual(
    codesFor(`class B { #n: number = 0; b(): number { return this.#n; } }
class D extends B { #n: number = 1; d(): number { return this.#n; } }
console.log(new D().d() + new D().b());
`),
    ['STA1214'],
  );
});

void test('the #brand-in-object test is a not-yet, not an accepted member access', () => {
  // `#n in o` is not a property read: it asks whether o carries the slot at all, which needs a
  // shape test the layout has no room for while every instance of a class has every slot.
  assert.deepEqual(
    codesFor(`class C {
  #n: number = 0;
  static has(o: C): boolean { return #n in o; }
}
console.log(C.has(new C()));
`),
    ['STA1214'],
  );
});

void test('accessors are accepted; what has no place to live is not', () => {
  const body = `  raw: number = 0;\n  get value(): number {\n    return this.raw;\n  }\n  set value(v: number) {\n    this.raw = v;\n  }\n`;
  assert.deepEqual(
    codesFor(`class C {\n${body}}\nconst c = new C();\nc.value = 1;\nconsole.log(c.value);`),
    [],
  );
  // A read-modify-write is a get AND a set of one property, and what evaluates the receiver once
  // across the pair hoists a slot -- which an accessor is not.
  assert.deepEqual(
    codesFor(`class C {\n${body}}\nconst c = new C();\nc.value += 1;\nconsole.log(c.value);`),
    ['STA1214'],
  );
  assert.deepEqual(
    codesFor(`class C {\n${body}}\nconst c = new C();\nc.value++;\nconsole.log(c.value);`),
    ['STA1214'],
  );
  // A static accessor belongs to the class OBJECT, and a static here is one plain binding.
  assert.deepEqual(
    codesFor(
      'class C {\n  static raw: number = 0;\n  static get value(): number {\n    return C.raw;\n  }\n}\nconsole.log(C.value);',
    ),
    ['STA1214'],
  );
});

void test('an object literal is accepted exactly where its shape is a fixed slot list', () => {
  assert.deepEqual(codesFor("const p = { x: 1, y: 'two' };\nconsole.log(p.x);"), []);
  assert.deepEqual(codesFor('const e = {};\nconsole.log(e);'), []);
  assert.deepEqual(codesFor('const t = { c: { d: 1 } };\nconsole.log(t.c.d);'), []);
});

void test('every literal form that is not a fixed slot list is a not-yet', () => {
  // A method needs a member function table the shape has no declaration to build; a spread needs
  // the key set at RUNTIME; a computed key needs it at runtime too; and shorthand is the one that
  // looks accepted-adjacent -- it is a distinct AST node the gate must reach on purpose.
  assert.deepEqual(codesFor('const o = { m(): number { return 1; } };\nconsole.log(o);'), [
    'STA1214',
  ]);
  assert.deepEqual(codesFor('const a = { x: 1 };\nconst b = { ...a };\nconsole.log(b.x);'), [
    'STA1214',
  ]);
  assert.deepEqual(codesFor("const k = 'x';\nconst o = { [k]: 1 };\nconsole.log(o.x);"), [
    'STA1214',
  ]);
  assert.deepEqual(codesFor('const x = 1;\nconst o = { x };\nconsole.log(o.x);'), ['STA1214']);
  assert.deepEqual(
    codesFor('const o = {\n  get x(): number {\n    return 1;\n  },\n};\nconsole.log(o);'),
    ['STA1214'],
  );
});

// Task 4.1: an anonymous shape with an OPTIONAL property has no fixed slot list, so it takes the
// dynamic path — shape table + inline caches (docs/VALUE.md §4.10). The gate's job is drawing the
// line: optional or indexed shapes are dynamic, all-required shapes stay fixed, and everything a
// shape table alone cannot serve (methods, calls through it) stays deferred.
void test('an object literal typed by an optional shape is accepted', () => {
  assert.deepEqual(codesFor('const o: { x?: number } = { x: 1 };\nconsole.log(o);'), []);
  // The empty literal is the canonical dynamic object: nothing to build a layout FROM.
  assert.deepEqual(codesFor('const o: { x?: number } = {};\nconsole.log(o);'), []);
});

void test('reads and plain writes through a dynamic shape are accepted', () => {
  const source = 'const o: { x?: number; y?: number } = { x: 1 };\no.y = 2;\nconsole.log(o.x);';
  assert.deepEqual(codesFor(source), []);
});

void test('compound assignment through a dynamic shape stays deferred', () => {
  // The fold reads the place, and the read-once machinery hoists SLOTS — a shape-table entry is
  // not one, so `o.x += 1` must be refused rather than fold to a double resolution.
  const source = 'const o: { x?: number } = { x: 1 };\no.x += 1;';
  assert.deepEqual(codesFor(source), ['STA1214']);
});

void test('a method MEMBER still refuses the literal; a call through the shape stays deferred', () => {
  // A function-typed property is data — a closure in a slot — and is accepted like any value. What
  // stays refused is method SYNTAX in the literal, and CALLING through the shape: both need a
  // bound method object nothing builds yet (Phase 5).
  const method = 'const o: { x?: number } = { x: 1, m() { return 2; } } as { x?: number };';
  assert.notDeepEqual(codesFor(method), []);
  const call = 'const o: { x?: number; m?: () => number } = { m: () => 2 };\nconsole.log(o.m());';
  assert.deepEqual(codesFor(call), ['STA1214']);
});

void test('the contextual type decides: a fully-required literal under an optional annotation is dynamic', () => {
  // `{ x: 1 }` alone is a perfectly good layout — but every later read of `o` goes through the
  // annotation, so the literal must build the dynamic object those reads resolve against.
  assert.deepEqual(codesFor('const o: { x?: number } = { x: 1 };\nconsole.log(o.x);'), []);
});

// Task 4.2, Math slice: methods exist only as callees, constants only as reads, and the
// declaration-file test keeps a user binding named Math on the ordinary identifier path.
void test('Math methods and constants in the landed set are accepted', () => {
  assert.deepEqual(codesFor('console.log(Math.floor(2.5));'), []);
  assert.deepEqual(codesFor('console.log(Math.min(1, 2, 3));'), []);
  assert.deepEqual(codesFor('console.log(Math.PI);'), []);
  assert.deepEqual(codesFor('console.log(NaN);\nconsole.log(Infinity);'), []);
});

void test('the bit-exact Math members are accepted', () => {
  assert.deepEqual(codesFor('console.log(Math.clz32(7));'), []);
  assert.deepEqual(codesFor('console.log(Math.imul(3, 4));'), []);
  assert.deepEqual(codesFor('console.log(Math.fround(0.1));'), []);
});

void test('a Math method as a VALUE and an unlanded Math member stay deferred', () => {
  assert.deepEqual(codesFor('const f = Math.floor;\nconsole.log(f(1));'), ['STA1214']);
  // sin is implementation-approximated: it waits on vendored fdlibm (golden tests are
  // byte-for-byte against Node, whose answers come from V8's fdlibm, not the host libm).
  assert.deepEqual(codesFor('console.log(Math.sin(1));'), ['STA1214']);
  assert.deepEqual(codesFor('const xs = [1, 2];\nconsole.log(Math.min(...xs));'), ['STA1214']);
});

// Task 4.2, String slice: the closed STRING_OPS set is accepted only in callee position on a
// string-typed receiver; everything else on String.prototype stays deferred.
void test('String.prototype ops in the landed set are accepted', () => {
  assert.deepEqual(codesFor('console.log("abc".indexOf("b", 1));'), []);
  assert.deepEqual(codesFor('const s: string = "a,b";\nconsole.log(s.split(","));'), []);
  assert.deepEqual(codesFor('console.log("a-b".replaceAll("-", "+"));'), []);
  assert.deepEqual(codesFor('console.log("x".padStart(3, "0"));'), []);
});

void test('String.prototype residue stays deferred', () => {
  // A method as a VALUE: there is no bound-function object to hand out yet.
  assert.deepEqual(codesFor('const f = "abc".trim;\nconsole.log(f());'), ['STA1214']);
  // A member outside the landed set: `match` answers an array WITH properties, which the array
  // representation has no room for yet.
  assert.deepEqual(codesFor('console.log("abc".match(/b/));'), ['STA1214']);
  // split's limit argument changes the element-count contract; deferred with the rest.
  assert.deepEqual(codesFor('console.log("a,b".split(",", 1));'), ['STA1214']);
  // A REPLACEMENT that is a regexp is not a pattern: only argument zero takes one.
  assert.deepEqual(codesFor('console.log("abc".replace("b", /x/));'), ['STA1214']);
  // A replacer FUNCTION runs user code per match, which no string op has machinery for.
  assert.deepEqual(codesFor('console.log("abc".replace(/b/, (m: string) => m));'), ['STA1214']);
  // Spread arguments never reach the fixed-arity table.
  assert.deepEqual(codesFor('const xs: [string] = ["b"];\nconsole.log("abc".includes(...xs));'), [
    'STA1214',
  ]);
});

// Task 4.2, Array slice: the closed ARRAY_OPS set on an array-typed receiver, with the refusals
// that keep the fixed-arity table honest.
void test('the at/codePointAt/concat/identity string ops are accepted, variadic concat deferred', () => {
  assert.deepEqual(codesFor('const s: string = "a";\nconsole.log(s.at(-1));'), []);
  assert.deepEqual(codesFor('const s: string = "a";\nconsole.log(s.codePointAt(0));'), []);
  assert.deepEqual(codesFor('const s: string = "a";\nconsole.log(s.concat("b"));'), []);
  assert.deepEqual(codesFor('const s: string = "a";\nconsole.log(s.toString());'), []);
  assert.deepEqual(codesFor('const s: string = "a";\nconsole.log(s.concat("b", "c"));'), [
    'STA1214',
  ]);
});

void test('Array.prototype ops in the landed set are accepted', () => {
  assert.deepEqual(codesFor('const xs: number[] = [1];\nconsole.log(xs.push(2));'), []);
  assert.deepEqual(codesFor('const xs: number[] = [1, 2];\nconsole.log(xs.indexOf(2, 1));'), []);
  assert.deepEqual(codesFor('const xs: number[] = [1, 2];\nconsole.log(xs.join("-"));'), []);
  assert.deepEqual(codesFor('const xs: number[] = [1, 2];\nconsole.log(xs.concat([3]));'), []);
  // The callback methods: an arrow, and a named function as the callback.
  assert.deepEqual(
    codesFor('const xs: number[] = [1];\nconsole.log(xs.map((x: number): number => x));'),
    [],
  );
  assert.deepEqual(
    codesFor(
      'function odd(x: number): boolean { return x % 2 === 1; }\nconsole.log([1, 2].filter(odd));',
    ),
    [],
  );
  // reduce, in its with-initial form.
  assert.deepEqual(
    codesFor(
      'const xs: number[] = [1];\nconsole.log(xs.reduce((a: number, x: number): number => a + x, 0));',
    ),
    [],
  );
  // The structural ops: exact-arity splice, default-depth flat, copyWithin's padded range.
  assert.deepEqual(codesFor('const xs: number[] = [1, 2, 3];\nconsole.log(xs.splice(1, 1));'), []);
  assert.deepEqual(codesFor('const xs: number[][] = [[1]];\nconsole.log(xs.flat());'), []);
  assert.deepEqual(
    codesFor('const xs: number[] = [1, 2, 3];\nconsole.log(xs.copyWithin(0, 1));'),
    [],
  );
  assert.deepEqual(
    codesFor('const xs: number[] = [1];\nconsole.log(xs.flatMap((x: number): number[] => [x]));'),
    [],
  );
  // The find-last mirrors and the ES2023 immutable variants.
  assert.deepEqual(
    codesFor('const xs: number[] = [1];\nconsole.log(xs.findLast((x: number): boolean => x > 0));'),
    [],
  );
  assert.deepEqual(codesFor('const xs: number[] = [2, 1];\nconsole.log(xs.toReversed());'), []);
  assert.deepEqual(codesFor('const xs: number[] = [2, 1];\nconsole.log(xs.toSorted());'), []);
  assert.deepEqual(codesFor('const xs: number[] = [2, 1];\nconsole.log(xs.toString());'), []);
  assert.deepEqual(codesFor('const xs: number[] = [2, 1];\nconsole.log(xs.with(0, 9));'), []);
  // sort: the ToString default and the comparator form.
  assert.deepEqual(codesFor('const xs: number[] = [2, 1];\nconsole.log(xs.sort());'), []);
  assert.deepEqual(
    codesFor(
      'const xs: number[] = [2, 1];\nconsole.log(xs.sort((a: number, b: number): number => a - b));',
    ),
    [],
  );
});

void test('the locale-sensitive trio follows the ICU feature build', () => {
  // Off by default, and refused by NAME rather than by the generic subset-boundary code: the
  // program is not waiting for a phase, it is waiting for a build flag the message spells out.
  assert.deepEqual(codesFor('console.log("a".localeCompare("b", "en"));'), ['STA1215']);
  assert.deepEqual(codesFor('console.log("i".toLocaleUpperCase("tr"));'), ['STA1215']);
  assert.deepEqual(codesFor('console.log("I".toLocaleLowerCase("tr"));'), ['STA1215']);

  const saved = process.env['STATOR_RUNTIME'];
  process.env['STATOR_RUNTIME'] = 'intl';
  try {
    assert.deepEqual(codesFor('console.log("a".localeCompare("b", "en"));'), []);
    assert.deepEqual(codesFor('console.log("i".toLocaleUpperCase("tr"));'), []);
    // The absent-locale form stays refused WITH the flag on: the spec reads the host's default
    // locale there, so the compiled program's answer would depend on the machine that runs it.
    assert.deepEqual(codesFor('console.log("a".localeCompare("b"));'), ['STA1214']);
    assert.deepEqual(codesFor('console.log("i".toLocaleUpperCase());'), ['STA1214']);
    // `locales` is legally a string[] and `options` an object; both are Intl negotiation this
    // compiler does not model.
    assert.deepEqual(
      codesFor('const ls: string[] = ["en"];\nconsole.log("a".localeCompare("b", ls));'),
      ['STA1214'],
    );
  } finally {
    if (saved === undefined) {
      delete process.env['STATOR_RUNTIME'];
    } else {
      process.env['STATOR_RUNTIME'] = saved;
    }
  }
});

void test('Array.prototype residue stays deferred', () => {
  // The thisArg form of a callback method lowers with none of them.
  assert.deepEqual(
    codesFor(
      'const xs: number[] = [1];\nconsole.log(xs.map(function (x: number): number { return x; }, {}));',
    ),
    ['STA1214'],
  );
  // reduce WITHOUT an initial value is deferred: the first element becomes the seed there, and
  // an explicit undefined initial is an initial, so the forms cannot share a padded signature.
  assert.deepEqual(
    codesFor(
      'const xs: number[] = [1];\nconsole.log(xs.reduce((a: number, x: number): number => a + x));',
    ),
    ['STA1214'],
  );
  // splice's one-argument form deletes to the end -- not what a padded undefined would do.
  assert.deepEqual(codesFor('const xs: number[] = [1, 2, 3];\nconsole.log(xs.splice(1));'), [
    'STA1214',
  ]);
  // Variadic push has no node to fold into.
  assert.deepEqual(codesFor('const xs: number[] = [1];\nconsole.log(xs.push(2, 3));'), ['STA1214']);
  // lastIndexOf gives an explicit position a DIFFERENT meaning than an absent one, so the
  // undefined-padding that is sound everywhere else would change the answer.
  assert.deepEqual(codesFor('const xs: number[] = [1, 2];\nconsole.log(xs.lastIndexOf(1, 0));'), [
    'STA1214',
  ]);
  // concat lands as exactly one spread array.
  assert.deepEqual(codesFor('const xs: number[] = [1];\nconsole.log(xs.concat([2], [3]));'), [
    'STA1214',
  ]);
  // Object.prototype members that are NOT table entries must stay deferred: a bare `in` test
  // would find `constructor`/`hasOwnProperty` on the prototype chain (the hasOwn bug).
  assert.deepEqual(codesFor('const s: string = "a";\nconsole.log(s.hasOwnProperty("x"));'), [
    'STA1214',
  ]);
  // A method as a VALUE: there is no bound-function object to hand out.
  assert.deepEqual(codesFor('const xs: number[] = [1];\nconst f = xs.pop;'), ['STA1214']);
});

// Task 4.2, console slice: the eleven members whose output a golden test can hold to Node
// byte-for-byte lower; the rest of console stays deferred.
void test('console methods in the landed set are accepted, the rest deferred', () => {
  assert.deepEqual(codesFor('console.error("e");'), []);
  assert.deepEqual(codesFor('console.warn("w");'), []);
  assert.deepEqual(codesFor('console.info("i");\nconsole.debug("d");'), []);
  assert.deepEqual(codesFor('console.dir([1]);'), []);
  assert.deepEqual(codesFor('console.group("g");\nconsole.groupEnd();'), []);
  // Every optional tail is genuinely optional: the omitted argument pads to `undefined`, which
  // means for each of these exactly what absence means.
  assert.deepEqual(codesFor('console.group();\nconsole.groupEnd();'), []);
  assert.deepEqual(codesFor('console.count();\nconsole.count("k");'), []);
  assert.deepEqual(codesFor('console.countReset("k");'), []);
  assert.deepEqual(codesFor('console.assert(true);'), []);
  assert.deepEqual(codesFor('console.assert(false, "why");'), []);
  // `table` is a column-layout algorithm of its own; `time`/`timeEnd` print an elapsed duration
  // and `trace` a stack, none of which is output a golden test can pin to Node.
  assert.deepEqual(codesFor('console.table([1]);'), ['STA1214']);
  assert.deepEqual(codesFor('console.time("t");'), ['STA1214']);
  assert.deepEqual(codesFor('console.trace("t");'), ['STA1214']);
  // Arity is part of the accepted form, not a detail the emitter shrugs off.
  assert.deepEqual(codesFor('console.groupEnd(1);'), ['STA1214']);
  assert.deepEqual(codesFor('console.assert();'), ['STA1214']);
  assert.deepEqual(codesFor('console.count("a", "b");'), ['STA1214']);
  // A spread's argument COUNT is not its arity, and both the padding and the entry-point choice
  // are made by count.
  assert.deepEqual(codesFor('const xs: [number] = [1];\nconsole.log(...xs);'), ['STA1214']);
});

// Task 4.2: Map/Set forEach takes a CALLBACK, not an iterator — the distinction that lets it land
// while `keys`/`values`/`entries` wait on the Symbol.iterator protocol.
void test('Map and Set forEach are accepted; the iterator forms stay deferred', () => {
  const map = 'const m = new Map<string, number>();\nm.set("a", 1);\n';
  const set = 'const s = new Set<number>();\ns.add(1);\n';
  assert.deepEqual(
    codesFor(`${map}m.forEach((v: number, k: string): void => { console.log(k); });`),
    [],
  );
  assert.deepEqual(codesFor(`${set}s.forEach((v: number): void => { console.log(v); });`), []);
  // A callback the checker cannot type as callable would reach jsrt_call as a non-closure. The
  // gate speaks for itself here; a real build reports the lib's own type error alongside it, which
  // this helper does not collect.
  assert.deepEqual(codesFor(`${map}const cb: number = 1;\nm.forEach(cb);`), ['STA1214']);
  // The thisArg form binds a `this` a compiled callback does not have.
  assert.deepEqual(codesFor(`${map}m.forEach((v: number): void => { console.log(v); }, {});`), [
    'STA1214',
  ]);
  // The iterator forms hand back an iterator, which the subset has no node for.
  assert.deepEqual(codesFor(`${map}console.log(m.keys());`), ['STA1214']);
  assert.deepEqual(codesFor(`${map}console.log(m.entries());`), ['STA1214']);
  assert.deepEqual(codesFor(`${set}console.log(s.values());`), ['STA1214']);
  // An operation belongs to the collection that has it: a Set has no `get`, so it never reaches
  // the arity rule below the table lookup.
  assert.deepEqual(codesFor(`${set}console.log(s.get(1));`), ['STA1214']);
});

// Task 4.2, the ES2025 set operations: the only collection ops whose argument is a COLLECTION.
void test('the ES2025 set operations are accepted over two Sets, and refused over anything else', () => {
  const two = 'const a = new Set<number>();\na.add(1);\nconst b = new Set<number>();\nb.add(2);\n';
  assert.deepEqual(codesFor(`${two}console.log(a.union(b));`), []);
  assert.deepEqual(codesFor(`${two}console.log(a.intersection(b));`), []);
  assert.deepEqual(codesFor(`${two}console.log(a.difference(b));`), []);
  assert.deepEqual(codesFor(`${two}console.log(a.symmetricDifference(b));`), []);
  assert.deepEqual(codesFor(`${two}console.log(a.isSubsetOf(b));`), []);
  assert.deepEqual(codesFor(`${two}console.log(a.isSupersetOf(b));`), []);
  assert.deepEqual(codesFor(`${two}console.log(a.isDisjointFrom(b));`), []);
  // The lib types the parameter as a set-like OBJECT, so a Map is well-typed here and a plain
  // object literal is too. The runtime reads the argument as a table, so both are refused.
  const map = 'const m = new Map<number, number>();\nm.set(1, 1);\n';
  assert.deepEqual(codesFor(`${two}${map}console.log(a.union(m));`), ['STA1214']);
  assert.deepEqual(
    codesFor(
      `${two}const like = { size: 0, has: (v: number): boolean => v === 1, keys: (): IterableIterator<number> => b.keys() };\nconsole.log(a.union(like));`,
    ),
    // Two refusals: the `keys()` the value cannot be written without, and the argument rule.
    ['STA1214', 'STA1214'],
  );
  // They belong to Set alone -- a Map has no `union`, so it never reaches the argument rule.
  assert.deepEqual(codesFor(`${two}${map}console.log(m.union(a));`), ['STA1214']);
});

// Task 4.2, Object slice: the landed namespace, over the two object layouts only.
void test('Object namespace methods are accepted, the rest deferred', () => {
  assert.deepEqual(codesFor('console.log(Object.keys({ x: 1 }));'), []);
  assert.deepEqual(codesFor('console.log(Object.values({ x: 1 }));'), []);
  assert.deepEqual(codesFor('console.log(Object.entries({ x: 1 }));'), []);
  // The rest of the namespace, and a method as a value, stay deferred by name.
  assert.deepEqual(codesFor('console.log(Object.assign({ x: 1 }, { y: 2 }));'), ['STA1214']);
  assert.deepEqual(codesFor('const f = Object.keys;\nconsole.log(f({ x: 1 }));'), ['STA1214']);
  // An argument the runtime cannot walk: an array answers index strings in Node, which neither
  // object layout's walk would produce.
  assert.deepEqual(codesFor('console.log(Object.keys([1, 2]));'), ['STA1214']);
  // getOwnPropertyNames walks like keys; hasOwn takes a second, string-typed argument.
  assert.deepEqual(codesFor('console.log(Object.getOwnPropertyNames({ x: 1 }));'), []);
  assert.deepEqual(codesFor('console.log(Object.hasOwn({ x: 1 }, "x"));'), []);
  assert.deepEqual(
    codesFor('const k: string = "x";\nconsole.log(Object.hasOwn({ x: 1 }, k));'),
    [],
  );
  // Arity is exact per method, both ways.
  assert.deepEqual(codesFor('console.log(Object.hasOwn({ x: 1 }));'), ['STA1214']);
  assert.deepEqual(codesFor('console.log(Object.keys({ x: 1 }, "x"));'), ['STA1214']);
  // fromEntries is the mirror of the walkers: it wants the ARRAY, not the object.
  assert.deepEqual(
    codesFor('const p: string[][] = [["a", "b"]];\nconsole.log(typeof Object.fromEntries(p));'),
    [],
  );
  assert.deepEqual(codesFor('console.log(typeof Object.fromEntries({ x: 1 }));'), ['STA1214']);
});

// Task 4.2, JSON slice: stringify's single-argument form only.
void test('JSON.stringify is accepted, its other forms deferred', () => {
  assert.deepEqual(codesFor('console.log(JSON.stringify({ x: 1 }));'), []);
  assert.deepEqual(codesFor('console.log(JSON.stringify([1, 2]));'), []);
  assert.deepEqual(codesFor('console.log(JSON.stringify("s"));'), []);
  // The replacer/space forms change the whole output shape.
  assert.deepEqual(codesFor('console.log(JSON.stringify({ x: 1 }, null, 2));'), ['STA1214']);
  // A method as a value, and the rest of the namespace by name.
  assert.deepEqual(codesFor('const f = JSON.stringify;\nconsole.log(f(1));'), ['STA1214']);
  // A top-level argument that may be undefined: the spec answers undefined where the call's
  // type promises a string.
  assert.deepEqual(
    codesFor('function f(x: number | undefined): string { return JSON.stringify(x); }\nf(1);'),
    ['STA1214'],
  );
  // Likewise a function-typed argument -- stringify answers undefined for it at the top level.
  assert.deepEqual(codesFor('const g = (): number => 1;\nconsole.log(JSON.stringify(g));'), [
    'STA1214',
  ]);
});

// Task 4.2, JSON.parse slice: the single-argument form, whose result is Unknown.
void test('JSON.parse is accepted in its single-argument form', () => {
  assert.deepEqual(codesFor('const v: unknown = JSON.parse("[1]");\nconsole.log(typeof v);'), []);
  // Any string-ish argument, not just the `string` type itself.
  assert.deepEqual(
    codesFor(
      'const t: "a" | "b" = "a";\nconst v: unknown = JSON.parse(t);\nconsole.log(typeof v);',
    ),
    [],
  );
  // An untyped argument is the js-mode norm and is accepted -- the runtime settles the tag.
  assert.deepEqual(codesFor('export function f(t) {\n  return JSON.parse(t);\n}', 'js'), []);
  // A reviver runs user code at every node of the result.
  assert.deepEqual(
    codesFor(
      'const v: unknown = JSON.parse("1", (_k: string, x: unknown) => x);\nconsole.log(typeof v);',
    ),
    ['STA1214'],
  );
  // As a value rather than a callee, like every other namespace member.
  assert.deepEqual(codesFor('const f = JSON.parse;\nconsole.log(typeof f("1"));'), ['STA1214']);
  // The gate's answer for an argument the checker types as a known non-string.
  assert.deepEqual(codesFor('export const v = JSON.parse(42);', 'js'), ['STA1214']);
  // The rest of the namespace is still deferred by name.
  assert.deepEqual(codesFor('console.log(typeof JSON.rawJSON);'), ['STA1214']);
});

void test('a user binding named Math shadows the global and stays on the ordinary path', () => {
  // The local wins at runtime, so it must win at the gate: inside the function this is a property
  // read on a shape, not a builtin. (Function-scoped, because at the top level of a SCRIPT a
  // `const Math` is a TS redeclaration error against the global `var Math` — the checker then
  // resolves the name to the lib symbol, and there is no shadow to test.)
  const source =
    'function f(): number { const Math = { floor: 1 }; return Math.floor; }\nconsole.log(f());';
  assert.deepEqual(codesFor(source), []);
});

// Task 4.3, the RegExp slice: `test` is the landed surface, and everything else on the prototype
// keeps the family's own code (STA1211) rather than the generic subset-boundary one.
void test('regexp literals and test are accepted, the rest of the prototype deferred', () => {
  assert.deepEqual(codesFor('const re = /ab+c/gi;\nconsole.log(re.test("abbc"));'), []);
  // A literal is a value: it lives in a binding, an array, and an argument position.
  assert.deepEqual(codesFor('console.log(/x/.test("x"));'), []);
  assert.deepEqual(codesFor('const all = [/a/, /b/];\nconsole.log(all.length);'), []);
  // The subject follows JSON.parse's rule: a string, or untyped and settled by the runtime.
  assert.deepEqual(codesFor('console.log(/x/.test(1));'), ['STA1214']);
  assert.deepEqual(
    codesFor(
      'function f(s: unknown): boolean { return /x/.test(s as string); }\nconsole.log(f(1));',
    ),
    [],
  );
  // Everything else on the prototype -- methods that answer an array with properties, and the
  // data properties the object model has no node for -- is deferred under STA1211.
  assert.deepEqual(codesFor('console.log(/x/.exec("x"));'), ['STA1211']);
  assert.deepEqual(codesFor('const re = /x/;\nconsole.log(re.source);'), ['STA1211']);
  assert.deepEqual(codesFor('const re = /x/g;\nconsole.log(re.lastIndex);'), ['STA1211']);
  // A method as a VALUE is refused for the reason every other prototype method is: nothing here
  // builds the bound closure it would need.
  assert.deepEqual(codesFor('const re = /x/;\nconst t = re.test;\nconsole.log(t);'), ['STA1211']);
});

// Task 4.3, second slice: a pattern position takes a string OR a regexp, and everything else in
// an argument position is still a string.
void test('the regexp forms of the pattern-taking string methods are accepted', () => {
  assert.deepEqual(codesFor("console.log('a1b'.split(/\\d/));"), []);
  assert.deepEqual(codesFor("console.log('a1b'.replace(/\\d/, '#'));"), []);
  assert.deepEqual(codesFor("console.log('a1b'.replaceAll(/\\d/g, '#'));"), []);
  assert.deepEqual(codesFor("console.log('a1b'.search(/\\d/));"), []);
  // `search` has no string form: the spec builds a RegExp out of the argument, with a constructor
  // this compiler does not have.
  assert.deepEqual(codesFor("console.log('a1b'.search('1'));"), ['STA1214']);
  // A regexp in a REPLACEMENT position is not a pattern; the string forms are unchanged.
  assert.deepEqual(codesFor("console.log('a1b'.replace('1', '#'));"), []);
  // `match` is not in the op table at all: it answers an array with properties.
  assert.deepEqual(codesFor("console.log('a1b'.match(/\\d/));"), ['STA1214']);
});
