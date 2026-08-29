// @mode: ts
// @verdict: static
// @expected-fail: true
// SUBSET.md: Exponentiation operator **

const a: number = 2;
const b: number = 3;
const c: number = a ** b;
export { c };
