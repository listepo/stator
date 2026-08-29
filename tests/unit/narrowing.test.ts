/* Boundary-check insertion (Task 3.5) — where an `unknown` becomes something, and what it costs.
 *
 * The golden fixtures prove the OUTPUT matches Node, and they would keep proving it if the compiler
 * emitted no checks at all: a program whose types are honest behaves the same either way. What the
 * checks buy is the case golden fixtures cannot contain — a value that is not what the program
 * claimed — so what has to be tested here is their PRESENCE, and their absence where the claim was
 * already true. That is the whole subject of this file: a check on a concrete value is a runtime
 * cost with no soundness gain, and a missing check is an unsound read the compiler then trusts.
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type {
  BoundaryCheck,
  Expression,
  FunctionDeclaration,
  TypeOf,
} from '../../src/hir/nodes.ts';
import { hTypeName } from '../../src/hir/types.ts';
import { verifyHir } from '../../src/hir/verify.ts';
import { gateCodes, hirNodes, loweredStatements, lowerSource } from './helpers.ts';

function nodesOf(code: string): { kind: string }[] {
  return hirNodes(loweredStatements(code));
}

function checksIn(code: string): BoundaryCheck[] {
  return nodesOf(code).filter((n): n is BoundaryCheck => n.kind === 'boundary-check');
}

test('a typeof guard inserts one check at the narrowed read', () => {
  const checks = checksIn(`
    function f(x: unknown): number {
      if (typeof x === "number") {
        return x + 1;
      }
      return 0;
    }
    console.log(f(1));
  `);
  assert.equal(checks.length, 1);
  assert.equal(hTypeName(checks[0]?.type ?? { kind: 'unknown', fromImplicitAny: false }), 'number');
  assert.equal(checks[0]?.value.type.kind, 'unknown');
});

test('each narrowed read is checked, not just the first', () => {
  // The claim is made per USE, not per binding: the compiler has no proof that the value did not
  // change between two reads, and a check that covered "the rest of the block" would be exactly
  // the kind of unproven reasoning golden rule 4 forbids.
  const checks = checksIn(`
    function f(x: unknown): number {
      if (typeof x === "number") {
        return x + x + x;
      }
      return 0;
    }
    console.log(f(1));
  `);
  assert.equal(checks.length, 3);
});

test('a union narrows through the same machinery as an unknown', () => {
  // The HType model has no union node, so `string | number` IS Unknown to it -- which means union
  // narrowing needed no separate feature, only the check the unknown case already gets.
  const checks = checksIn(`
    function f(v: string | number): number {
      if (typeof v === "string") {
        return v.length;
      }
      return v * 2;
    }
    console.log(f("ab"));
  `);
  assert.deepEqual(
    checks.map((c) => hTypeName(c.type)),
    ['string', 'number'],
  );
});

test('an as-cast off an unknown is checked', () => {
  const checks = checksIn(`
    function f(x: unknown): number {
      return (x as number) + 1;
    }
    console.log(f(1));
  `);
  assert.deepEqual(
    checks.map((c) => hTypeName(c.type)),
    ['number'],
  );
});

test('a value the compiler already types concretely is never checked', () => {
  // Three shapes that look like boundaries and are not: an ordinary typed parameter, a cast that
  // asserts what the checker already proved, and a widening to `unknown`, which cannot be false.
  assert.deepEqual(
    checksIn(`
      function f(n: number): number {
        const same = n as number;
        const wide = n as unknown;
        console.log(wide);
        return same + n;
      }
      console.log(f(1));
    `),
    [],
  );
});

test('an unnarrowed unknown stays unknown and is not checked', () => {
  // Printing an `unknown` asks nothing of it, so there is nothing to settle. Inserting a check here
  // would refuse programs that are correct -- `console.log` accepts any value.
  const nodes = nodesOf(`
    function f(x: unknown): void {
      console.log(x);
    }
    f(1);
  `);
  assert.equal(nodes.filter((n) => n.kind === 'boundary-check').length, 0);
});

test('typeof lowers to its own node, typed string, and does not coerce', () => {
  const nodes = nodesOf('console.log(typeof 42);');
  const typeOf = nodes.find((n): n is TypeOf => n.kind === 'typeof');
  assert.notEqual(typeOf, undefined);
  assert.equal(hTypeName(typeOf?.type ?? { kind: 'unknown', fromImplicitAny: false }), 'string');
  // The operand keeps its own type: `typeof` is the one prefix operator that runs no conversion.
  assert.equal((typeOf as unknown as { operand: Expression }).operand.type.kind, 'number');
});

test('typeof of an unknown is a string, so the result is not dynamic', () => {
  // The union of eight string literals TypeScript gives `typeof` widens to `string`. Without that
  // widening the answer would be Unknown and asking an unknown value what it is would produce
  // another unknown -- which would make every guard in the language dynamic.
  const [decl] = loweredStatements(`
    function f(x: unknown): string {
      return typeof x;
    }
    console.log(f(1));
  `);
  assert.equal(decl?.kind, 'function-declaration');
  assert.equal(hTypeName((decl as FunctionDeclaration).fn.type), '(a0: unknown) => string');
});

test('the check carries a file:line:col the emitter can bake in', () => {
  // The location has to be captured in the frontend: a column needs the source text, and by the
  // time the emitter runs the text is gone. A check that could not say where it failed would be
  // close to useless in a compiled binary with no source map at runtime.
  const [check] = checksIn(`
    function f(x: unknown): number {
      return (x as number) + 1;
    }
    console.log(f(1));
  `);
  assert.match(check?.where ?? '', /^\/test\.ts:3:15$/);
});

test('an inserted check is verifier-clean', () => {
  const { module } = lowerSource(`
    function f(v: string | number): number {
      if (typeof v === "string") {
        return v.length;
      }
      return v * 2;
    }
    console.log(f("ab"));
  `);
  assert.deepEqual(verifyHir(module), []);
});

test('a cast to a type no tag settles is dropped, not believed', () => {
  // `isCheckable` covers number, string and boolean -- the types a tag answers in constant time.
  // For anything else the cast lowers to its operand ALONE, still typed `unknown`, so the value
  // stays on the dynamic path. Refusing instead would be the wrong trade: it buys no soundness
  // (nothing downstream was going to trust the type) and costs programs that compile today.
  const code = `
    function f(x: unknown): void {
      const a = x as number[];
      console.log(a);
    }
    f([1]);
  `;
  assert.deepEqual(gateCodes(code), []);
  assert.deepEqual(checksIn(code), []);
});
