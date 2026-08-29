// @mode: ts
// @verdict: static
// @expected-fail: true
// SUBSET.md: Map with primitive keys (string, number, boolean, null, undefined)

const m: Map<string, number> = new Map([["key", 42]]);
export { m };
