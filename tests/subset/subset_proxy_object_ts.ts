// @mode: ts
// @verdict: error
// @code: STA1106
// @expected-fail: true
// SUBSET.md: Proxy object

const p = new Proxy({}, {});
export { p };
