// @mode: ts
// @verdict: dynamic
// @expected-fail: true
// SUBSET.md: Object literals with dynamic keys, index signatures

const key: string = "prop";
export const obj: { [k: string]: number } = { [key]: 42 };
