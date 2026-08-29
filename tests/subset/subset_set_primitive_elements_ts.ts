// @mode: ts
// @verdict: static
// @expected-fail: true
// SUBSET.md: Set with primitive elements

const s: Set<string> = new Set(["a", "b", "c"]);
export { s };
