// @mode: js
// @verdict: dynamic
// @expected-fail: true
// SUBSET.md: Map with object or unknown keys

const obj = { id: 1 };
const m = new Map([[obj, 42]]);
export { m };
