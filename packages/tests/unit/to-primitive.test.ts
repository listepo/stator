/* A user toString/valueOf when an object becomes a primitive (plan.md §9 Task 6.27, plan-notes 345).
 *
 * The goldens (`golden/ts/to_primitive.ts`, `golden/js/to_primitive.js`) hold every conversion
 * site to the pinned Node byte-for-byte. What they cannot hold is the runtime's copy of Node's
 * `builtInObjects`, the set util.format's `%s` consults to decide whether an INHERITED toString
 * is a builtin's (inspect) or the program's (call it). Node records that set when `inspect.js`
 * is evaluated. A binary built with the startup snapshot (the pinned Node on every platform
 * whose official package is compiled natively) evaluates it during snapshot generation, before
 * the late globals exist. The official win-arm64 package is cross-compiled from win-x64, so
 * `configure.py` sets `node_use_node_snapshot` false and `inspect.js` runs at first use, after
 * those globals exist (plan-notes 354). The runtime copies the snapshot set. This re-measures
 * the running Node and compares it with `jsrt_print.c`, using the snapshot flag so a
 * cross-compiled binary is not asked to equal a set it never recorded. */

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

/** `process.config.variables` does not declare this key (`@types/node` 26.6.2). Node writes
 * it as the string `'true'`/`'false'` from `configure.py` and exposes a boolean at run time. */
function nodeBuiltWithStartupSnapshot(): boolean {
  const variables = process.config.variables as { node_use_node_snapshot?: boolean | string };
  const flag = variables.node_use_node_snapshot;
  return flag === true || flag === 'true';
}

/** Globals that exist by the time a no-snapshot Node evaluates `inspect.js`, and that the
 * snapshot build of v26.7.0 does not put in `builtInObjects`. Measured on the official
 * win-arm64 binary (CI job 113033051244, plan-notes 352 and 354). Any other extra, or any
 * name missing from the runtime list, is a real mismatch and fails the test. */
const LATE_BUILTINS_WITHOUT_STARTUP_SNAPSHOT: readonly string[] = [
  'AsyncDisposableStack',
  'DisposableStack',
  'Float16Array',
  'SharedArrayBuffer',
  'SuppressedError',
  'Temporal',
  'WebAssembly',
];

/** The set `util.format` must report for this process: the snapshot set when the binary was
 * built with one, and that set plus the late globals when it was not. */
function expectedBuiltinNames(runtime: readonly string[]): string[] {
  if (nodeBuiltWithStartupSnapshot()) {
    return [...runtime];
  }
  return [...runtime, ...LATE_BUILTINS_WITHOUT_STARTUP_SNAPSHOT].sort();
}

test('the runtime names the same builtin constructors as the pinned Node', () => {
  const runtime = runtimeBuiltinNames();
  assert.deepEqual(measuredBuiltinNames(), expectedBuiltinNames(runtime));
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
