// @mode: js
// @verdict: dynamic
// @expected-fail: true
// SUBSET.md: Map with primitive keys (string, number, boolean, null, undefined)

const m = new Map([["key", 42]]);
export { m };
