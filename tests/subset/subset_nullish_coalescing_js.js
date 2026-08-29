// @mode: js
// @verdict: static
// @expected-fail: true
// SUBSET.md: Nullish coalescing ??

const v = null ?? 0;
export { v };
