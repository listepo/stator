// @mode: js
// @verdict: dynamic
// @expected-fail: true
// SUBSET.md: for...in loop

const obj = { a: 1, b: 2 };
let keys = [];
for (const key in obj) {
  keys.push(key);
}
export { keys };
