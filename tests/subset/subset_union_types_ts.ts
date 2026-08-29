// @mode: ts
// @verdict: dynamic
// @expected-fail: true
// SUBSET.md: Union types

type Value = string | number;
export const x: Value = "hi";
