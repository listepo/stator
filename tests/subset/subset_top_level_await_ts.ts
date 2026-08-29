// @mode: ts
// @verdict: not-yet
// @code: STA1208
// @expected-fail: true
// SUBSET.md: Top-level await

const result = await Promise.resolve(42);
export { result };
