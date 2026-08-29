/* Monomorphization (rung 3.4) — the pass that has no pass.
 *
 * Specialization happens AT the lowering: a generic declaration is lowered once per concrete type
 * tuple, with the substitution in scope, so a type parameter is never built into the HIR at all.
 * That makes "no `T` survives" an invariant of construction rather than an obligation on a later
 * walk — and it is exactly what these tests pin down, because the golden fixtures cannot: correct
 * stdout is equally consistent with emitting the same specialization four times.
 *
 * What is checked here: the tuple the checker's inference is recovered as, that equal tuples share
 * one function, that unequal ones do not, that a specialization keeps the source's printable name,
 * and the four shapes the gate refuses because the lowering has no answer for them.
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { FunctionDeclaration } from '../../src/hir/nodes.ts';
import { hTypeName } from '../../src/hir/types.ts';
import { verifyHir } from '../../src/hir/verify.ts';
import { lowerSourceFile } from '../../src/lower/index.ts';
import { createProgram, gateCodes, loweredStatements, lowerSource } from './helpers.ts';

/** Every function the lowering emitted, by the name it is BOUND under — the specialization key
 * `box<number>` for a specialization, the plain name for an ordinary function. */
function emittedFunctions(code: string): string[] {
  return loweredStatements(code)
    .filter((s): s is FunctionDeclaration => s.kind === 'function-declaration')
    .map((s) => s.name);
}

test('a generic is specialized once per concrete type tuple', () => {
  assert.deepEqual(
    emittedFunctions(`
      function box<T>(item: T): T { return item; }
      console.log(box(42));
      console.log(box("x"));
    `),
    ['box<number>', 'box<string>'],
  );
});

test('two calls with the same tuple share one specialization', () => {
  // The checker infers `T = 42` for the first call and `T = 7` for the second -- two DIFFERENT
  // literal types. Unification runs on HType, where both are `number`, so the two collapse. This is
  // the reason the tuple is expressed in HType and not in ts.Type.
  assert.deepEqual(
    emittedFunctions(`
      function box<T>(item: T): T { return item; }
      console.log(box(42));
      console.log(box(7));
    `),
    ['box<number>'],
  );
});

test('a multi-parameter generic keys on the whole tuple, in order', () => {
  assert.deepEqual(
    emittedFunctions(`
      function pair<A, B>(a: A, b: B): string { return \`\${a}/\${b}\`; }
      console.log(pair(1, "one"));
      console.log(pair("two", 2));
      console.log(pair(3, "three"));
    `),
    ['pair<number, string>', 'pair<string, number>'],
  );
});

test('a compound type argument is part of the key', () => {
  assert.deepEqual(
    emittedFunctions(`
      function count<T>(items: T[]): number { return items.length; }
      console.log(count([1, 2]));
      console.log(count(["a"]));
    `),
    ['count<number>', 'count<string>'],
  );
});

test('a generic calling a generic instantiates the callee at the caller substitution', () => {
  // `twice<string>` calls `box` at `T = string`, which is only knowable once `twice`'s own T is
  // bound -- so the collection walk has to carry the enclosing substitution into the nested call.
  // The order is the queue's, breadth-first: `twice`'s two tuples come from the source's own calls,
  // and `box`'s come from lowering those. Nothing depends on it -- the emitter forward-declares
  // every function before defining any -- but it is asserted rather than sorted away, because a
  // change in it means the walk changed shape.
  assert.deepEqual(
    emittedFunctions(`
      function box<T>(item: T): T { return item; }
      function twice<T>(item: T): T { return box(box(item)); }
      console.log(twice(1));
      console.log(twice("z"));
    `),
    ['twice<number>', 'twice<string>', 'box<number>', 'box<string>'],
  );
});

test('a specialization keeps the source name, not the key it is bound under', () => {
  // The key is unspellable on purpose (no identifier contains an angle bracket), but it must not
  // reach the emitted closure: `console.log(f)` prints `[Function: box]` in Node, not
  // `[Function: box<number>]`.
  const [decl] = loweredStatements(`
    function box<T>(item: T): T { return item; }
    console.log(box(1));
  `);
  assert.equal(decl?.kind, 'function-declaration');
  assert.equal((decl as FunctionDeclaration).name, 'box<number>');
  assert.equal((decl as FunctionDeclaration).fn.name, 'box');
});

test('no type parameter survives into the HIR', () => {
  const { module } = lowerSource(`
    function box<T>(item: T): T { return item; }
    function count<T>(items: T[]): number { return items.length; }
    console.log(box("x"));
    console.log(count([1, 2]));
  `);
  // STA4054 is the verifier's type-parameter check. It runs before every other expression rule
  // precisely so that a leftover `T` is reported as itself rather than as a downstream mismatch.
  assert.deepEqual(
    verifyHir(module)
      .filter((p) => p.code === 'STA4054')
      .map((p) => p.message),
    [],
  );
});

test('the specialization is typed with its concrete arguments', () => {
  const [decl] = loweredStatements(`
    function box<T>(item: T): T { return item; }
    console.log(box("x"));
  `);
  assert.equal(decl?.kind, 'function-declaration');
  assert.equal(hTypeName((decl as FunctionDeclaration).fn.type), '(a0: string) => string');
});

test('a generic used as a value is refused, not specialized', () => {
  // There is no tuple to specialize on: the value is the function itself, and monomorphization has
  // nothing to monomorphize. Refused at the gate rather than lowered to one arbitrary instantiation.
  assert.deepEqual(
    gateCodes(`
      function box<T>(item: T): T { return item; }
      console.log(box);
    `),
    ['STA1214'],
  );
});

test('a type parameter no argument determines is refused', () => {
  // `T` appears in no parameter and in no return type, so no call ever determines it. Recovering
  // the substitution by unification finds nothing to bind, and `unresolved` is the honest answer.
  assert.deepEqual(
    gateCodes(`
      function f<T>(n: number): number { return n; }
      console.log(f(1));
    `),
    ['STA1214'],
  );
});

test('a constrained type parameter is refused', () => {
  // A constraint is a second thing to check (does the argument satisfy it?) that the subset has no
  // machinery for; accepting it silently would specialize on tuples the checker never approved.
  assert.deepEqual(
    gateCodes(`
      function big<T extends number>(item: T): T { return item; }
      console.log(big(1));
    `),
    ['STA1214'],
  );
});

test('explicit type arguments on a non-generic call are refused', () => {
  assert.deepEqual(
    gateCodes(`
      function f(n: number): number { return n; }
      console.log(f<number>(1));
    `).length > 0,
    true,
  );
});

test('a generic arrow or function expression is refused', () => {
  // Only a DECLARATION can be specialized: the collection walk finds it by name and lowers its
  // body once per tuple, and an expression has no declaration to go back to.
  assert.deepEqual(
    gateCodes(`
      const box = <T,>(item: T): T => item;
      console.log(box(1));
    `),
    ['STA1214'],
  );
});

test('a generic that instantiates itself at a larger type is capped, not looped', () => {
  // `grow<T>` calls `grow<T[]>`, so every instantiation demands a strictly larger one and the queue
  // never drains. Monomorphization has no fixed point here and no amount of patience finds one, so
  // the cap is the only thing between this program and an emitter that runs until memory does.
  // Deliberately a USER error (STA2003), not an internal one: the program really is not compilable
  // ahead of time. The reported name shows the cap was reached by growth, not by recursion depth.
  // Called through lowerSourceFile rather than the `lowerSource` helper above: the cap ABANDONS the
  // module (there is no partial answer to give), and the helper's contract is that a module exists.
  const { program, sourceFile } = createProgram(`
    function grow<T>(item: T): number { return grow([item]); }
    console.log(grow(1));
  `);
  const { module, diagnostics } = lowerSourceFile(sourceFile, program.getTypeChecker());
  assert.equal(module, null);
  assert.deepEqual(
    diagnostics.map((d) => d.code),
    ['STA2003'],
  );
  assert.match(diagnostics[0]?.message ?? '', /grow<number\[\]\[\]/);
});
