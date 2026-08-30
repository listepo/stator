// @mode: ts
// @verdict: static
// SUBSET.md: RegExp.prototype methods
// `test` is the whole of the landed surface: one runtime function over the vendored engine, and
// the only member of the prototype that answers a plain boolean.

const re = /hello/i;
const result = re.test('hello world');
export { result };
