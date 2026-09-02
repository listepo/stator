// @mode: ts
// @verdict: static
// SUBSET.md: Top-level await

const result: number = await Promise.resolve(42);
console.log(result);
