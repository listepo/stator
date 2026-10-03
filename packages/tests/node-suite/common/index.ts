/* `require('../common')` for the selected Node tests (plan.md §11c T11.7), in strict TS.
 *
 * A port of the helpers the selection uses from Node v26.7.0 `test/common/index.js`
 * (https://github.com/nodejs/node/blob/v26.7.0/test/common/index.js), not a copy of the file:
 * it grows with the selection. Node's version also guards against leaked globals and wires
 * crash reporting; neither is here. It imports no `node:util` (N2): `inspect.ts` prints what
 * the messages need. The Stator build reaches this file through the corpus's `test/common`
 * link; the pinned Node, through host-hook.ts. */
import assert from 'node:assert';
import process from 'node:process';
import { inspectValue } from './inspect.ts';

export const isWindows = process.platform === 'win32';
export const isSunOS = process.platform === 'sunos';
export const isFreeBSD = process.platform === 'freebsd';
export const isOpenBSD = process.platform === 'openbsd';
export const isLinux = process.platform === 'linux';
export const isMacOS = process.platform === 'darwin';

interface CallCheck {
  readonly name: string;
  /** `exactly N` or `at least N`, as the exit report spells it. */
  readonly segment: string;
  readonly ok: (actual: number) => boolean;
  actual: number;
}

const callChecks: CallCheck[] = [];

/** Node's `runCallChecks`: on a clean exit, every wrapped function was called as promised. */
function runCallChecks(exitCode: number): void {
  if (exitCode !== 0) return;
  const failed = callChecks.filter((check) => !check.ok(check.actual));
  for (const check of failed) {
    console.log(
      `Mismatched ${check.name} function calls. Expected ${check.segment}, actual ${String(check.actual)}.`,
    );
  }
  if (failed.length > 0) process.exit(1);
}

type Callable = (...args: never[]) => unknown;

function noop(): undefined {
  return undefined;
}

function mustCallInner<F extends Callable>(
  fn: F,
  criteria: number,
  field: 'exact' | 'minimum',
): (...args: Parameters<F>) => ReturnType<F> {
  if (callChecks.length === 0) process.on('exit', runCallChecks);
  const check: CallCheck = {
    name: fn.name === '' ? '<anonymous>' : fn.name,
    segment: `${field === 'exact' ? 'exactly' : 'at least'} ${String(criteria)}`,
    ok: field === 'exact' ? (actual) => actual === criteria : (actual) => actual >= criteria,
    actual: 0,
  };
  callChecks.push(check);
  return (...args: Parameters<F>): ReturnType<F> => {
    check.actual++;
    // The wrapper forwards exactly the parameters `F` declares.
    return Reflect.apply(fn, undefined, args) as ReturnType<F>;
  };
}

/** The returned function must be called exactly `exact` times (default 1) before exit. */
export function mustCall(exact?: number): () => undefined;
export function mustCall<F extends Callable>(
  fn: F,
  exact?: number,
): (...args: Parameters<F>) => ReturnType<F>;
export function mustCall(fn?: Callable | number, exact = 1): Callable {
  if (typeof fn === 'number') return mustCallInner(noop, fn, 'exact');
  return mustCallInner(fn ?? noop, exact, 'exact');
}

/** The returned function must be called at least `minimum` times (default 1) before exit. */
export function mustCallAtLeast(minimum?: number): () => undefined;
export function mustCallAtLeast<F extends Callable>(
  fn: F,
  minimum?: number,
): (...args: Parameters<F>) => ReturnType<F>;
export function mustCallAtLeast(fn?: Callable | number, minimum = 1): Callable {
  if (typeof fn === 'number') return mustCallInner(noop, fn, 'minimum');
  return mustCallInner(fn ?? noop, minimum, 'minimum');
}

/** A function that fails the test when called. */
export function mustNotCall(message?: string): (...args: unknown[]) => never {
  return (...args: unknown[]): never => {
    const called =
      args.length > 0
        ? `\ncalled with arguments: ${args.map((arg) => inspectValue(arg)).join(', ')}`
        : '';
    assert.fail(`${message ?? 'function should not have been called'}${called}`);
  };
}

/** A callback that must be called once with exactly one error matching `validator`. */
export function expectsError(
  validator: Parameters<typeof assert.throws>[1],
  exact = 1,
): (...args: unknown[]) => boolean {
  return mustCall((...args: unknown[]): boolean => {
    if (args.length !== 1)
      assert.fail(
        `Expected one argument, got [ ${args.map((arg) => inspectValue(arg)).join(', ')} ]`,
      );
    const error = args[0];
    assert.throws(() => {
      throw error;
    }, validator);
    return true;
  }, exact);
}

export function printSkipMessage(message: string): void {
  console.log(`1..0 # Skipped: ${message}`);
}

/** Skip the rest of the test: the TAP skip line, then a clean exit. */
export function skip(message: string): never {
  printSkipMessage(message);
  process.exit(0);
}

/** The tail Node appends to an `ERR_INVALID_ARG_TYPE` message for `input`. */
export function invalidArgTypeHelper(input: unknown): string {
  if (input === null || input === undefined) return ` Received ${String(input)}`;
  if (typeof input === 'function') return ` Received function ${input.name}`;
  if (typeof input === 'object') {
    const name: unknown = input.constructor?.name;
    if (typeof name === 'string' && name !== '') return ` Received an instance of ${name}`;
    return ` Received ${inspectValue(input)}`;
  }
  let inspected = inspectValue(input);
  // Upstream writes `inspected.slice(inspected, 0, 25)`, whose start coerces to 0 and whose end
  // is 0: the kept prefix is empty. Ported as it behaves.
  if (inspected.length > 28) inspected = '...';
  return ` Received type ${typeof input} (${inspected})`;
}
