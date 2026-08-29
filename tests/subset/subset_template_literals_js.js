// @mode: js
// @verdict: dynamic
// @expected-fail: true
// SUBSET.md: Template literals

const name = "world";
const num = 42;
const msg = `Hello ${name}, the answer is ${num}`;
export { msg };
