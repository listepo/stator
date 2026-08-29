// @mode: ts
// @verdict: dynamic
// @expected-fail: true
// SUBSET.md: Map with object or unknown keys

const obj = { id: 1 };
const m: Map<object, number> = new Map([[obj, 42]]);
export { m };
