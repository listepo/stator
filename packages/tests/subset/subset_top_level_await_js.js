// @mode: js
// @verdict: static
// SUBSET.md: Top-level await
// Promise.resolve(42) is a typed builtin; the awaited binding is inferred number.

const result = await Promise.resolve(42);
console.log(result);
