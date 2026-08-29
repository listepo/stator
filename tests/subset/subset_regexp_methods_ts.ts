// @mode: ts
// @verdict: not-yet
// @code: STA1211
// @expected-fail: true
// SUBSET.md: RegExp.prototype methods

const re = /hello/i;
const result = re.test("hello world");
export { result };
