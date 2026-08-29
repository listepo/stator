// @mode: js
// @verdict: dynamic
// @expected-fail: true
// SUBSET.md: Object destructuring

const p = { x: 1, y: 2 };
const { x, y } = p;
export { x, y };
