// @mode: js
// @verdict: dynamic
// @expected-fail: true
// SUBSET.md: Array destructuring

const arr = [1, 2, 3];
const [a, b] = arr;
export { a, b };
