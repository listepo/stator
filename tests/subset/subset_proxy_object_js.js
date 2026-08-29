// @mode: js
// @verdict: not-yet
// @code: STA1203
// @expected-fail: true
// SUBSET.md: Proxy object

const p = new Proxy({}, {});
export { p };
