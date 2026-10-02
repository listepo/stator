// node:assert from js mode (plan.md §11c T11.7): the default export's members, called on
// untyped values, and the AssertionError a failure throws.
import assert from 'node:assert';

assert.ok(true);
assert.strictEqual(2 + 2, 4);
assert.deepStrictEqual({ list: [1, 'two'] }, { list: [1, 'two'] });
assert.match('node-suite', /suite$/);
assert.throws(() => {
  throw new RangeError('too far');
}, { name: 'RangeError', message: /far/ });
try {
  assert.strictEqual('a', 'b', 'letters differ');
} catch (error) {
  console.log(error.name, error.code, error.operator, error.actual, error.expected);
}
try {
  assert.throws(() => {}, undefined, 'must throw');
} catch (error) {
  console.log(error.message, error.generatedMessage);
}
console.log('done');
