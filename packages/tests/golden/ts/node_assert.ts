// node:assert — the minimal slice (plan.md §11c T11.7). A failing assertion throws an
// AssertionError whose code, operator and custom message match Node. Only a message's first line
// is printed: Node v26 appends a diff of the two values after it, which Stator does not render.
import assert, {
  AssertionError,
  deepStrictEqual,
  fail,
  match,
  notStrictEqual,
  ok,
  rejects,
  strictEqual,
  throws,
} from 'node:assert';

function firstLine(text: string): string {
  const end = text.indexOf('\n');
  return end < 0 ? text : text.slice(0, end);
}

function report(label: string, run: () => void): void {
  try {
    run();
    console.log(label, 'passed');
  } catch (error) {
    if (error instanceof AssertionError) {
      console.log(label, error.name, error.code, error.operator, firstLine(error.message), error.generatedMessage);
    } else {
      console.log(label, 'other error');
    }
  }
}

report('ok', () => ok(1));
report('ok-fail', () => ok(0, 'zero is falsy'));
report('strictEqual', () => strictEqual('a', 'a'));
report('strictEqual-nan', () => strictEqual(NaN, NaN));
report('strictEqual-zero', () => strictEqual(0, -0, 'signed zero'));
report('strictEqual-fail', () => strictEqual(1, 2, 'one is not two'));
report('notStrictEqual', () => notStrictEqual(1, 2));
report('notStrictEqual-fail', () => notStrictEqual('x', 'x', 'same'));
report('deep', () => deepStrictEqual({ a: [1, 2], b: { c: 'd' } }, { a: [1, 2], b: { c: 'd' } }));
report('deep-fail', () => deepStrictEqual([1, 2], [1, 3], 'arrays differ'));
report('deep-keys', () => deepStrictEqual({ a: 1 }, { a: 1, b: 2 }, 'keys differ'));
report('match', () => match('abc', /^a.c$/));
report('match-fail', () => match('abc', /^x/, 'no x'));
report('fail', () => fail('boom'));
report('throws', () =>
  throws(() => {
    throw new TypeError('bad type');
  }),
);
report('throws-regexp', () =>
  throws(() => {
    throw new TypeError('bad type');
  }, /^TypeError: bad/),
);
report('throws-object', () =>
  throws(
    () => {
      throw new RangeError('out of range');
    },
    { name: 'RangeError', message: /range/ },
  ),
);
report('throws-function', () =>
  throws(
    () => {
      throw new Error('e');
    },
    (error: unknown) => error instanceof Error,
  ),
);
report('throws-missing', () => throws(() => 1));
report('throws-missing-message', () => throws(() => 1, undefined, 'should throw'));
report('throws-mismatch', () =>
  throws(
    () => {
      throw new TypeError('t');
    },
    { name: 'RangeError' },
    'wrong class',
  ),
);
try {
  fail('boom');
} catch (error) {
  if (error instanceof AssertionError) console.log(error.toString());
}
report('default', () => assert.strictEqual(assert.ok, ok));

async function main(): Promise<void> {
  await rejects(Promise.reject(new Error('no')), { message: 'no' });
  console.log('rejects passed');
  try {
    await rejects(Promise.resolve(1));
  } catch (error) {
    if (error instanceof AssertionError) console.log('rejects-missing', error.message);
  }
  await rejects(async () => {
    throw new TypeError('async');
  }, /async/);
  console.log('rejects-fn passed');
}

await main();
