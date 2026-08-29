// @mode: js
// @verdict: dynamic
// @expected-fail: true
// SUBSET.md: Object literals with dynamic keys, index signatures

const key = "prop";
export const obj = { [key]: 42 };
