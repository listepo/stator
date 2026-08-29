// @mode: ts
// @verdict: static
// @expected-fail: true
// SUBSET.md: Spread operator ... in array literals

const arr1: number[] = [1, 2];
const arr2: number[] = [3, 4];
const combined: number[] = [...arr1, ...arr2];
export { combined };
