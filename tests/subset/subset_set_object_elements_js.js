// @mode: js
// @verdict: dynamic
// @expected-fail: true
// SUBSET.md: Set with object elements

const obj = { id: 1 };
const s = new Set([obj]);
export { s };
