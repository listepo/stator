// `node:assert` — the minimal slice Node's own tests need (plan.md §11c T11.7, docs/NODE.md):
// `ok`, `strictEqual`, `notStrictEqual`, `deepStrictEqual`, `throws`, `rejects`, `match` and
// `fail`, after Node v26.7.0 `lib/assert.js`. A failed assertion throws an `AssertionError` with
// Node's `code`, `operator`, `actual`, `expected` and `generatedMessage`. Three gaps, each a
// subset limit rather than a choice: the default export is an object, not a callable function
// (a function with properties is not-yet), `AssertionError` does not extend `Error` (extending a
// built-in is not-yet), and a generated message prints primitives only (no `util.inspect` yet).

/** What `new AssertionError(...)` reads, as in Node. */
export interface AssertionErrorOptions {
  message?: string;
  actual?: unknown;
  expected?: unknown;
  operator?: string;
}

export class AssertionError {
  readonly name: string = 'AssertionError';
  readonly code: string = 'ERR_ASSERTION';
  readonly message: string;
  readonly actual: unknown;
  readonly expected: unknown;
  readonly operator: string;
  readonly generatedMessage: boolean;

  constructor(options: AssertionErrorOptions) {
    this.generatedMessage = options.message === undefined;
    this.message = options.message ?? 'Failed';
    this.actual = options.actual;
    this.expected = options.expected;
    this.operator = options.operator ?? 'fail';
  }

  toString(): string {
    return `${this.name} [${this.code}]: ${this.message}`;
  }
}

/** A thrown validation object: each key must match the error's own property. */
export type ErrorValidation = Readonly<Record<string, unknown>>;

/** What `throws` and `rejects` accept after the function: Node's RegExp, validation object and
 * validation function forms. A class is not one of them yet (`instanceof` needs a class name). */
export type ErrorExpectation = RegExp | ErrorValidation | ((error: unknown) => boolean);

/** `Object.is`, spelled out: `-0` and `0` differ, `NaN` equals itself. */
function sameValue(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') {
    if (isNaN(a)) return isNaN(b);
    if (a === 0 && b === 0) return 1 / a === 1 / b;
    return a === b;
  }
  return a === b;
}

/** A primitive the way `util.inspect` prints it; anything else by its kind. */
function inspect(value: unknown): string {
  if (typeof value === 'string') return `'${value.replaceAll("'", "\\'")}'`;
  if (typeof value === 'number') return value === 0 && 1 / value < 0 ? '-0' : String(value);
  if (typeof value === 'bigint') return `${String(value)}n`;
  if (typeof value === 'function') return '[Function]';
  if (value instanceof RegExp) {
    const regexp: RegExp = value;
    return regexp.toString();
  }
  if (Array.isArray(value)) return '[Array]';
  if (typeof value === 'object' && value !== null) return '[Object]';
  return String(value);
}

function failWith(
  message: string | undefined,
  generated: string,
  actual: unknown,
  expected: unknown,
  operator: string,
): never {
  throw new AssertionError({ message: message ?? generated, actual, expected, operator });
}

/** Node's `isDeepStrictEqual` over primitives, arrays and plain objects (own enumerable string
 * keys). Prototypes, `Map`/`Set`, `Date` and boxed primitives are not compared yet. */
function deepEqual(actual: unknown, expected: unknown): boolean {
  if (sameValue(actual, expected)) return true;
  if (typeof actual !== 'object' || actual === null) return false;
  if (typeof expected !== 'object' || expected === null) return false;
  if (Array.isArray(actual) !== Array.isArray(expected)) return false;
  if (Array.isArray(actual) && Array.isArray(expected)) {
    const left: readonly unknown[] = actual;
    const right: readonly unknown[] = expected;
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i++) {
      if (!deepEqual(left[i], right[i])) return false;
    }
    return true;
  }
  const left = actual as Readonly<Record<string, unknown>>;
  const right = expected as Readonly<Record<string, unknown>>;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  for (const key of keys) {
    if (!Object.hasOwn(right, key) || !deepEqual(left[key], right[key])) return false;
  }
  return true;
}

export function ok(value: unknown, message?: string): void {
  if (!value) {
    failWith(message, 'The expression evaluated to a falsy value', value, true, '==');
  }
}

export function strictEqual(actual: unknown, expected: unknown, message?: string): void {
  if (!sameValue(actual, expected)) {
    failWith(
      message,
      `Expected values to be strictly equal:\n\n${inspect(actual)} !== ${inspect(expected)}\n`,
      actual,
      expected,
      'strictEqual',
    );
  }
}

export function notStrictEqual(actual: unknown, expected: unknown, message?: string): void {
  if (sameValue(actual, expected)) {
    failWith(
      message,
      `Expected "actual" to be strictly unequal to: ${inspect(expected)}`,
      actual,
      expected,
      'notStrictEqual',
    );
  }
}

export function deepStrictEqual(actual: unknown, expected: unknown, message?: string): void {
  if (!deepEqual(actual, expected)) {
    failWith(
      message,
      'Expected values to be strictly deep-equal',
      actual,
      expected,
      'deepStrictEqual',
    );
  }
}

export function match(string: string, regexp: RegExp, message?: string): void {
  if (!regexp.test(string)) {
    failWith(
      message,
      `The input did not match the regular expression ${inspect(regexp)}. Input:\n\n${inspect(string)}\n`,
      string,
      regexp,
      'match',
    );
  }
}

export function fail(message?: string): never {
  return failWith(message, 'Failed', undefined, undefined, 'fail');
}

/** The error's own property `key`, the way a validation object reads it. */
function propertyOf(error: unknown, key: string): unknown {
  if (typeof error !== 'object' || error === null) return undefined;
  if (error instanceof Error) {
    if (key === 'name') return error.name;
    if (key === 'message') return error.message;
  }
  const record = error as Readonly<Record<string, unknown>>;
  return record[key];
}

/** Node's `expectedException`: whether `error` satisfies `expected`, else an AssertionError. */
function checkError(
  error: unknown,
  expected: ErrorExpectation,
  message: string | undefined,
  operator: string,
): void {
  if (expected instanceof RegExp) {
    const regexp: RegExp = expected;
    const text = String(error);
    if (!regexp.test(text)) {
      failWith(
        message,
        `The input did not match the regular expression ${inspect(expected)}. Input:\n\n${inspect(text)}\n`,
        error,
        expected,
        operator,
      );
    }
    return;
  }
  if (typeof expected === 'function') {
    if (!expected(error)) {
      failWith(
        message,
        'The validation function is expected to return "true". Received false',
        error,
        expected,
        operator,
      );
    }
    return;
  }
  for (const key of Object.keys(expected)) {
    const want = expected[key];
    const got = propertyOf(error, key);
    let matched: boolean;
    if (want instanceof RegExp && typeof got === 'string') {
      const regexp: RegExp = want;
      matched = regexp.test(got);
    } else {
      matched = deepEqual(got, want);
    }
    if (!matched) {
      failWith(
        message,
        `Expected values to be strictly deep-equal at "${key}": ${inspect(got)} !== ${inspect(want)}`,
        error,
        expected,
        operator,
      );
    }
  }
}

export function throws(fn: () => unknown, expected?: ErrorExpectation, message?: string): void {
  let threw = false;
  let error: unknown;
  try {
    fn();
  } catch (caught) {
    threw = true;
    error = caught;
  }
  if (!threw) {
    const missing = message === undefined ? '.' : `: ${message}`;
    failWith(`Missing expected exception${missing}`, '', undefined, expected, 'throws');
  }
  if (expected !== undefined) checkError(error, expected, message, 'throws');
}

export async function rejects(
  promiseOrFn: Promise<unknown> | (() => Promise<unknown>),
  expected?: ErrorExpectation,
  message?: string,
): Promise<void> {
  const promise = typeof promiseOrFn === 'function' ? promiseOrFn() : promiseOrFn;
  let rejected = false;
  let error: unknown;
  try {
    await promise;
  } catch (caught) {
    rejected = true;
    error = caught;
  }
  if (!rejected) {
    const missing = message === undefined ? '.' : `: ${message}`;
    failWith(`Missing expected rejection${missing}`, '', undefined, expected, 'rejects');
  }
  if (expected !== undefined) checkError(error, expected, message, 'rejects');
}

/** The default export: Node's `assert` object (minus the call signature, see the header). */
export class AssertModule {
  readonly ok = ok;
  readonly strictEqual = strictEqual;
  readonly notStrictEqual = notStrictEqual;
  readonly deepStrictEqual = deepStrictEqual;
  readonly match = match;
  readonly fail = fail;
  readonly throws = throws;
  readonly rejects = rejects;
}

const assert = new AssertModule();

export default assert;
