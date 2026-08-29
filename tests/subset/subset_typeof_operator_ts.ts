// @mode: ts
// @verdict: static
// @expected-fail: true
// SUBSET.md: typeof operator

const x: number = 42;
const t: string = typeof x;
export { t };
