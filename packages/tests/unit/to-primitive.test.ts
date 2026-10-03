/* A user toString/valueOf when an object becomes a primitive (plan.md §9 Task 6.27, plan-notes 345).
 *
 * The goldens (`golden/ts/to_primitive.ts`, `golden/js/to_primitive.js`) hold every conversion
 * site to the pinned Node byte-for-byte. What they cannot hold is the runtime's copy of Node's
 * `builtInObjects`, the set util.format's `%s` consults to decide whether an INHERITED toString
 * is a builtin's (inspect) or the program's (call it): it is a fact about the pinned Node, so this
 * re-measures it on the Node running the tests and compares it with `jsrt_print.c`. */

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { format } from 'node:util';
import { test } from 'vitest';
import { NATIVE_ONLY, compileAndRunStreams } from './helpers.ts';

/** The names util.format treats as builtin constructors, asked the way `hasBuiltInToString`
 * looks: an object inheriting a toString from a prototype whose `constructor` is a function of
 * that name. A builtin name makes `%s` inspect the object; any other calls the method. */
function measuredBuiltinNames(): string[] {
  const candidates = Object.getOwnPropertyNames(globalThis).filter((name) =>
    /^[A-Z][a-zA-Z0-9]+$/.test(name),
  );
  return candidates
    .filter((name) => {
      const prototype = {
        toString(): string {
          return 'user';
        },
      };
      const constructor = function () {};
      Object.defineProperty(constructor, 'name', { value: name });
      Object.defineProperty(prototype, 'constructor', { value: constructor });
      return format('%s', Object.create(prototype)) !== 'user';
    })
    .sort();
}

/** The runtime's list, read from its source: the array literal under its declared name. */
function runtimeBuiltinNames(): string[] {
  const source = readFileSync(new URL('../../runtime/src/jsrt_print.c', import.meta.url), 'utf8');
  const body = /BUILTIN_CONSTRUCTOR_NAMES\[\] = \{([^}]*)\}/.exec(source)?.[1];
  assert.ok(body !== undefined, 'BUILTIN_CONSTRUCTOR_NAMES not found in jsrt_print.c');
  return [...body.matchAll(/"([^"]+)"/g)].map((match) => match[1] ?? '').sort();
}

test('the runtime names the same builtin constructors as the pinned Node', () => {
  assert.deepEqual(runtimeBuiltinNames(), measuredBuiltinNames());
});

test(
  '%s of an inherited toString calls it unless a builtin-named class wrote it',
  NATIVE_ONLY,
  () => {
    // `Atomics` is in builtInObjects, so Node inspects; `Plain` is not, so Node calls the method.
    const { stdout } = compileAndRunStreams(
      [
        "class Atomics { toString(): string { return 'user'; } }",
        'class Sub extends Atomics { n: number = 1; }',
        "class Plain { toString(): string { return 'plain'; } }",
        'class Kid extends Plain {}',
        "console.log('%s|%s|%s', new Sub(), new Atomics(), new Kid());",
        '',
      ].join('\n'),
      'to-primitive',
    );
    assert.equal(stdout, 'Sub { n: 1 }|Atomics {}|plain\n');
  },
);
