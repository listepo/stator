/* Step-12(d) class member surface — the parts golden tests cannot see.
 *
 * A golden proves the program PRINTS what Node prints. It cannot prove why: that an overload
 * signature emitted no function, that an optional member is one slot rather than two spellings
 * of one, or that a derived constructor's initializers run after `super` wherever `super`
 * stands. Each of those is an invariant the emitter depends on, pinned here.
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { ClassDeclaration, Statement } from '../../compiler/src/hir/nodes.ts';
import { gateCodes, hirNodes, verifiedStatements } from './helpers.ts';

function classOf(code: string): ClassDeclaration {
  const found = verifiedStatements(code).find((s) => s.kind === 'class-declaration');
  assert.ok(found !== undefined, 'source should declare a class');
  return found as ClassDeclaration;
}

function classesOf(code: string): ClassDeclaration[] {
  return verifiedStatements(code).filter(
    (s): s is ClassDeclaration => s.kind === 'class-declaration',
  );
}

const OVERLOADED = `class C {
  n: number;
  constructor(n: string);
  constructor(n: number);
  constructor(n: string | number) {
    this.n = typeof n === "number" ? n : 1;
  }
  m(x: string): string;
  m(x: number): number;
  m(x: string | number): string | number {
    return x;
  }
}
`;

test('overload signatures emit nothing; the implementation is the one method', () => {
  const decl = classOf(OVERLOADED);
  assert.deepEqual(
    decl.methods.map((m) => m.name),
    ['m'],
    'two signatures and one implementation lower to one member function',
  );
  assert.ok(decl.ctor !== undefined, 'the constructor implementation survives its signatures');
  assert.equal(decl.ctor.fn.params.length, 2, 'receiver plus the implementation parameter');
});

test('overload signatures are accepted in both modes', () => {
  assert.deepEqual(gateCodes(OVERLOADED, 'ts'), []);
  assert.deepEqual(gateCodes(OVERLOADED, 'js'), []);
});

test('a constructor signature without an implementation stays not-yet', () => {
  const sigOnly = `class C {
    constructor(n: string);
  }
  `;
  assert.deepEqual(gateCodes(sigOnly, 'ts'), ['STA1214']);
});

test('a method signature without an implementation stays not-yet', () => {
  const sigOnly = `class C {
    m(x: string): string;
  }
  `;
  assert.deepEqual(gateCodes(sigOnly, 'ts'), ['STA1214']);
});

test('two constructor bodies are still refused, with or without signatures', () => {
  const bodies = `class C {
    n: number;
    constructor(n: string) {
      this.n = 1;
    }
    constructor(n: number) {
      this.n = n;
    }
  }
  `;
  assert.deepEqual(gateCodes(bodies, 'ts'), ['STA1214']);
});

test('static overloads emit one binding, not one per signature', () => {
  const decl = classOf(`class C {
    static make(s: string): number;
    static make(n: number): number;
    static make(v: string | number): number {
      return typeof v === "number" ? v : 0;
    }
  }
  `);
  assert.deepEqual(
    decl.statics.map((s) => (s as { name: string }).name),
    ['C.make'],
  );
});

test('a derived class forwards the implementation parameters, not a signature', () => {
  const [base, derived] = classesOf(`${OVERLOADED}class D extends C {
    constructor(n: number) {
      super(n);
    }
  }
  `);
  assert.ok(base !== undefined && derived !== undefined);
  assert.ok(derived.ctor !== undefined);
  // The base implementation takes one user parameter; a signature's arity must not leak in.
  assert.equal(derived.ctor.fn.params.length, 2, 'receiver plus the forwarded parameter');
});

test('no stray statements leak from skipped signatures', () => {
  const statements: readonly Statement[] = verifiedStatements(OVERLOADED);
  assert.equal(statements.length, 1, 'the class is the only statement');
});

test('an optional method with a body lowers as a plain method', () => {
  const decl = classOf(`class C {
    m?(): number {
      return 1;
    }
  }
  `);
  assert.deepEqual(
    decl.methods.map((m) => m.name),
    ['m'],
    'the `?` narrows assignability only; at runtime the method is always present',
  );
  assert.deepEqual(
    gateCodes(
      `class C {
      m?(): number {
        return 1;
      }
    }
    `,
      'ts',
    ),
    [],
  );
});

test('an initialized optional field lowers as a plain field', () => {
  const decl = classOf(`class C {
    x?: number = 5;
  }
  `);
  assert.deepEqual(
    decl.fields.map((f) => f.name),
    ['x'],
    'the initializer runs for every instance, so the slot is always present',
  );
});

test('an uninitialized optional field lowers as a plain field', () => {
  // Absent versus holding `undefined` was the old refusal's worry; Node uses define-semantics
  // here (`"x" in c` is true), the slot is always present, and `jsrt_object_new` zero-fills it
  // to `undefined` — so there is no distinction to keep (plan.md §8 step-12 S-B).
  const decl = classOf(`class C {
    x?: number;
  }
  `);
  assert.deepEqual(
    decl.fields.map((f) => f.name),
    ['x'],
    'the slot is always present, like its initialized twin',
  );
  assert.deepEqual(
    gateCodes(
      `class C {
        x?: number;
      }
      `,
      'ts',
    ),
    [],
  );
});

const ACCESSOR = `class C {
  val: number = 0;
  get value(): number {
    return this.val;
  }
  set value(v: number) {
    this.val = v;
  }
}
`;

test('a statement-position compound on an accessor is accepted', () => {
  assert.deepEqual(gateCodes(`${ACCESSOR}const c = new C();\nc.value += 1;\n`, 'ts'), []);
  assert.deepEqual(gateCodes(`${ACCESSOR}const c = new C();\nc.value++;\n`, 'ts'), []);
  assert.deepEqual(gateCodes(`${ACCESSOR}const c = new C();\n--c.value;\n`, 'ts'), []);
});

test('a value-position compound on an accessor stays not-yet', () => {
  // The target lowers to the getter call, which is not an update place.
  assert.deepEqual(gateCodes(`${ACCESSOR}const c = new C();\nconst y = c.value++;\n`, 'ts'), [
    'STA1214',
  ]);
  assert.deepEqual(gateCodes(`${ACCESSOR}const c = new C();\nconst y = (c.value += 1);\n`, 'ts'), [
    'STA1214',
  ]);
});

test('an accessor compound evaluates a side-effecting receiver once', () => {
  const statements = verifiedStatements(
    `${ACCESSOR}function f(c: C): C {\n  return c;\n}\nconst c = new C();\nf(c).value += 1;\n`,
  );
  const block = statements.at(-1);
  assert.equal(block?.kind, 'block', 'the hoisted receiver and the write form one block');
});

const PRIVATE_ACCESSOR = `class C {
  #v: number = 0;
  get #x(): number {
    return this.#v;
  }
  set #x(v: number) {
    this.#v = v;
  }
  run(): number {
    this.#x = 3;
    return this.#x;
  }
  has(o: object): boolean {
    return #x in o;
  }
}
`;

test('a #private accessor lowers as a mangled member function', () => {
  const decl = classOf(PRIVATE_ACCESSOR);
  assert.deepEqual(
    decl.methods.map((m) => m.name),
    ['get #x', 'set #x', 'run', 'has'],
    'private accessors join the method list under mangled names, like public ones',
  );
  assert.deepEqual(gateCodes(PRIVATE_ACCESSOR, 'ts'), []);
  assert.deepEqual(gateCodes(PRIVATE_ACCESSOR, 'js'), []);
});

test('a computed accessor name stays not-yet', () => {
  assert.deepEqual(
    gateCodes(`const k = "x";\nclass C {\n  get [k](): number {\n    return 1;\n  }\n}\n`, 'ts'),
    ['STA1214'],
  );
});

test('a #private accessor re-declaring an ancestor one stays not-yet', () => {
  assert.deepEqual(
    gateCodes(
      `class B {\n  get #x(): number {\n    return 1;\n  }\n}\nclass D extends B {\n  get #x(): number {\n    return 2;\n  }\n}\n`,
      'ts',
    ),
    ['STA1214'],
  );
});

test('the brand check lowers to instanceof against the declaring class', () => {
  const statements = verifiedStatements(
    `class C {\n  #v: number = 0;\n  has(o: object): boolean {\n    return #v in o;\n  }\n}\n`,
  );
  const kinds = hirNodes(statements).map((n) => n.kind);
  assert.ok(!kinds.includes('binary-op'), 'no `in` binary node survives the lowering');
  const test = hirNodes(statements).find((n) => n.kind === 'instanceof');
  assert.ok(test !== undefined, 'the brand check is an instanceof node');
  assert.equal(
    (test as unknown as { className: string }).className,
    'C',
    'the brand resolves to the class that declares it',
  );
});

test('a brand check cannot name an ancestor-declared brand from a subclass', () => {
  // Private names are lexically scoped: `#v` is not in scope inside `D`, so there is no class
  // for the check to name. (An inherited brand METHOD still works on a subclass instance --
  // the golden proves it -- because the use site is the base's own body.)
  assert.deepEqual(
    gateCodes(
      `class C {\n  #v: number = 0;\n}\nclass D extends C {\n  has(o: object): boolean {\n    return #v in o;\n  }\n}\n`,
      'ts',
    ),
    ['STA1214'],
  );
});

const STATIC_ACCESSOR = `class C {
  static val: number = 0;
  static get value(): number {
    return C.val;
  }
  static set value(v: number) {
    C.val = v;
  }
}
`;

test('a static accessor emits two plain functions under mangled static names', () => {
  const decl = classOf(STATIC_ACCESSOR);
  assert.deepEqual(
    decl.statics.map((s) => s.name),
    ['C.val', 'C.get value', 'C.set value'],
    'the pair joins the statics, mangled exactly as instance accessors mangle methods',
  );
  for (const name of ['C.get value', 'C.set value']) {
    const binding = decl.statics.find((s) => s.name === name);
    assert.equal(binding?.declKind, 'const', 'an accessor function cannot be reassigned');
  }
  assert.deepEqual(gateCodes(STATIC_ACCESSOR, 'ts'), []);
  assert.deepEqual(gateCodes(STATIC_ACCESSOR, 'js'), []);
});

test('a static accessor read lowers to a getter call, not a binding read', () => {
  const statements = verifiedStatements(`${STATIC_ACCESSOR}export const x = C.value;\n`);
  const kinds = hirNodes(statements).map((n) => n.kind);
  assert.ok(kinds.includes('call'), 'reading `C.value` runs the getter');
});

test('a static #private accessor name stays not-yet', () => {
  assert.deepEqual(
    gateCodes(`class C {\n  static get #x(): number {\n    return 1;\n  }\n}\n`, 'ts'),
    ['STA1214'],
  );
});

test('a static accessor overriding an inherited static stays not-yet', () => {
  // Only a COMPLETE pair shadows cleanly: a lone half would split the pair across the chain,
  // with the missing half resolving to a binding the subclass never emitted.
  assert.deepEqual(
    gateCodes(
      `class C {\n  static get val(): number {\n    return 1;\n  }\n  static set val(v: number) {\n  }\n}\nclass D extends C {\n  static get val(): number {\n    return 2;\n  }\n}\n`,
      'ts',
    ),
    ['STA1214'],
  );
  assert.deepEqual(
    gateCodes(
      `class C {\n  static get val(): number {\n    return 1;\n  }\n  static set val(v: number) {\n  }\n}\nclass D extends C {\n  static get val(): number {\n    return 2;\n  }\n  static set val(v: number) {\n  }\n}\n`,
      'ts',
    ),
    [],
  );
});

const STATIC_BLOCK = `class C {
  static n = 1;
  static {
    C.n = 2;
  }
}
`;

test('a static block lowers after the class declaration, in the same scope', () => {
  const statements = verifiedStatements(STATIC_BLOCK);
  assert.equal(statements.length, 1, 'the declaration and its blocks stay one statement');
  const block = statements[0];
  assert.equal(block?.kind, 'block', 'a flattened wrapper, not a new node kind');
  const inner = (block as unknown as { statements: { kind: string }[] }).statements;
  assert.deepEqual(
    inner.map((s) => s.kind),
    ['class-declaration', 'block'],
  );
  assert.deepEqual(gateCodes(STATIC_BLOCK, 'ts'), []);
  assert.deepEqual(gateCodes(STATIC_BLOCK, 'js'), []);
});

test('this in a static block stays not-yet', () => {
  assert.deepEqual(
    gateCodes(`class C {\n  static n = 1;\n  static {\n    this.n = 2;\n  }\n}\n`, 'ts'),
    ['STA1214'],
  );
});

test('super in a static block stays not-yet', () => {
  assert.deepEqual(
    gateCodes(
      `class B {\n  m(): number {\n    return 1;\n  }\n}\nclass D extends B {\n  static s = 0;\n  static {\n    D.s = super.m();\n  }\n}\n`,
      'ts',
    ),
    ['STA1214'],
  );
});

test('a static field after a static block stays not-yet', () => {
  // In ts mode the checker also refuses this (`used before its initialization`); the gate owns
  // the js-mode refusal, where the layout would otherwise initialize the field after the block
  // that already wrote it.
  const source = `class C {\n  static {\n    C.n = 1;\n  }\n  static n = 2;\n}\n`;
  assert.deepEqual(gateCodes(source, 'js'), ['STA1214']);
  assert.deepEqual(gateCodes(source, 'ts'), ['STA1214']);
});

const LATE_SUPER = `class B {
  n: number;
  constructor(n: number) {
    this.n = n;
  }
}
`;

test('pre-super parameter validation is accepted', () => {
  const source = `${LATE_SUPER}class D extends B {
    doubled = 0;
    constructor(n: number) {
      const m = n * 2;
      super(m);
      this.doubled = this.n * 2;
    }
  }
  `;
  assert.deepEqual(gateCodes(source, 'ts'), []);
  const [, derived] = verifiedStatements(source).filter(
    (s): s is ClassDeclaration => s.kind === 'class-declaration',
  );
  assert.ok(derived?.ctor !== undefined);
  const kinds = hirNodes(derived.ctor.fn.body).map((n) => n.kind);
  // The field initializer runs after the super call, wherever the call stands.
  assert.ok(kinds.indexOf('super-call') < kinds.indexOf('field-assignment'));
});

test('a super call nested in a branch stays not-yet', () => {
  assert.deepEqual(
    gateCodes(
      `${LATE_SUPER}class D extends B {
        constructor(n: number) {
          if (n > 0) {
            super(n);
          } else {
            super(0);
          }
        }
      }
      `,
      'ts',
    ),
    ['STA1214'],
  );
});

test('a super call nested in an arrow stays not-yet', () => {
  // Legal JavaScript with no fixed position for the initializers, so honestly deferred.
  assert.deepEqual(
    gateCodes(
      `${LATE_SUPER}class D extends B {
        constructor(n: number) {
          super(n);
          const init = (): void => {
            super(n);
          };
          init();
        }
      }
      `,
      'js',
    ),
    ['STA1214'],
  );
});

const SHADOW = `class B {
  x: number = 1;
  static n: number = 10;
  static m(): number {
    return 100;
  }
}
class D extends B {
  override x: number = 2;
  static override n: number = 20;
  static override m(): number {
    return 200;
  }
}
`;

test('same-kind shadowing is accepted in both modes', () => {
  assert.deepEqual(gateCodes(SHADOW, 'ts'), []);
  assert.deepEqual(gateCodes(SHADOW, 'js'), []);
});

test('a shadowed field shares the base slot; shadowing statics keep both bindings', () => {
  const [, derived] = verifiedStatements(SHADOW).filter(
    (s): s is ClassDeclaration => s.kind === 'class-declaration',
  );
  assert.ok(derived !== undefined);
  assert.deepEqual(
    derived.fields.map((f) => f.name),
    ['x'],
    'one slot, written by both initializers in initializer order',
  );
  assert.deepEqual(
    derived.statics.map((s) => s.name),
    ['D.n', 'D.m'],
    'the subclass keeps its own static bindings; the base keeps its',
  );
});

test('a method over a field stays not-yet', () => {
  // A slot and a method under one name: reads would take the method while writes take the
  // slot, which is not what either spelling means.
  assert.deepEqual(
    gateCodes(
      `class B {\n  x: number = 1;\n}\nclass D extends B {\n  override x(): number {\n    return 2;\n  }\n}\n`,
      'ts',
    ),
    ['STA1214'],
  );
});

test('a field over a method stays not-yet', () => {
  assert.deepEqual(
    gateCodes(
      `class B {\n  m(): number {\n    return 1;\n  }\n}\nclass D extends B {\n  override m: number = 2;\n}\n`,
      'ts',
    ),
    ['STA1214'],
  );
});

test('a mixed-kind static shadow stays not-yet', () => {
  assert.deepEqual(
    gateCodes(
      `class C {\n  static val: number = 0;\n}\nclass D extends C {\n  static get val(): number {\n    return 1;\n  }\n  static set val(v: number) {\n  }\n}\n`,
      'ts',
    ),
    ['STA1214'],
  );
});

const INDEX_SIG = `class C {
  [k: string]: number;
  x: number = 1;
}
`;

test('an index signature adds no slot and refuses nothing declared', () => {
  const decl = classOf(INDEX_SIG);
  assert.deepEqual(
    decl.fields.map((f) => f.name),
    ['x'],
    'the signature contributes no layout of its own',
  );
  assert.deepEqual(gateCodes(INDEX_SIG, 'ts'), []);
  assert.deepEqual(gateCodes(INDEX_SIG, 'js'), []);
});

test('a dynamic key through an index signature stays not-yet', () => {
  // Every spelling funnels through the member access the gate vets: reads, writes, and element
  // access all name Phase 8's dictionary mode, while calls and compounds are checker errors.
  assert.deepEqual(gateCodes(`${INDEX_SIG}const c = new C();\nexport const y = c.dyn;\n`, 'ts'), [
    'STA1214',
  ]);
  assert.deepEqual(gateCodes(`${INDEX_SIG}const c = new C();\nc.dyn = 1;\n`, 'ts'), ['STA1214']);
  assert.deepEqual(
    gateCodes(`${INDEX_SIG}const c = new C();\nexport const y = c["dyn"];\n`, 'ts'),
    ['STA1214'],
  );
});

test('an undeclared member without an index signature is still the checkers business', () => {
  // No behavior change where no signature exists: the checker rejects first, and the gate's
  // accept set is untouched.
  assert.deepEqual(gateCodes(`class C {\n  x: number = 1;\n}\n`, 'ts'), []);
});
