/* Runtime failures are Node's errors, not crashes or silent nulls (plan.md §9 Task 6.23, QA audit
 * F6 and F12).
 *
 * The goldens (`golden/*\/stack_overflow.*`, `golden/*\/string_append.*`) hold the catchable cases
 * to the pinned Node byte-for-byte. These proofs cover what a golden diff cannot: an UNCAUGHT
 * overflow must end the run with a message rather than a signal, recursion no prologue sees must
 * still fail loudly, and the string length cap needs a half-gigabyte operand that the golden and
 * ASan passes should not each allocate. */

import { strict as assert } from 'node:assert';
import { test } from 'vitest';
import { NATIVE_ONLY, compileAndRunRaw } from './helpers.ts';

test('unbounded recursion fails with a diagnostic, not SIGSEGV', NATIVE_ONLY, () => {
  const run = compileAndRunRaw(
    'function f(n: number): number { return n === 0 ? 0 : 1 + f(n - 1); }\nconsole.log(f(1000000));\n',
    'stack-overflow',
  );
  assert.equal(run.signal, null, `killed by ${String(run.signal)}`);
  assert.equal(run.status, 1);
  assert.match(run.stderr, /RangeError/);
  assert.match(run.stderr, /Maximum call stack size exceeded/);
});

test(
  'runtime recursion past the stack is a loud STA2005, not a silent SIGSEGV',
  NATIVE_ONLY,
  () => {
    // JSON.stringify recurses in C, where no generated prologue checks the stack.
    const run = compileAndRunRaw(
      'let a: unknown[] = [];\nfor (let i = 0; i < 2000000; i++) a = [a];\nconsole.log(JSON.stringify(a).length);\n',
      'native-overflow',
    );
    assert.notEqual(run.signal, 'SIGSEGV');
    assert.notEqual(run.signal, 'SIGBUS');
    assert.equal(run.stdout, '');
    assert.match(run.stderr, /^PANIC: STA2005 stack overflow\nShadow stack depth: \d+ frames\n/);
  },
);

test('a concatenation past the maximum string length throws RangeError', NATIVE_ONLY, () => {
  // 2^28 code units twice is 2^29, past V8's 2^29 - 24: Node throws for each form below.
  const run = compileAndRunRaw(
    [
      "const big: string = 'x'.repeat(2 ** 28);",
      'let s = big;',
      'try {',
      '  s += big;',
      "  console.log('unreachable');",
      '} catch (e) {',
      '  console.log((e as Error).name, (e as Error).message);',
      '}',
      'try {',
      '  console.log(`${s}${big}`.length);',
      '} catch (e) {',
      '  console.log((e as Error).message);',
      '}',
      'try {',
      '  console.log(big.concat(s).length);',
      '} catch (e) {',
      '  console.log((e as Error).message);',
      '}',
      "console.log(s.length, (big + 'y').length);",
      '',
    ].join('\n'),
    'string-cap',
  );
  assert.equal(run.status, 0, run.stderr);
  assert.equal(
    run.stdout,
    'RangeError Invalid string length\nInvalid string length\nInvalid string length\n' +
      '268435456 268435457\n',
  );
});
