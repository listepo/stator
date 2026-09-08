// @mode: js
// @verdict: dynamic
// @expected-fail: true
// SUBSET.md: Spread operator ... in array literals

const arr1 = [1, 2];
const arr2 = [3, 4];
const combined = [...arr1, ...arr2];
export { combined };
