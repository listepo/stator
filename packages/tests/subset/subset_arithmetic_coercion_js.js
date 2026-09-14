// @mode: js
// @verdict: static
// SUBSET.md: arithmetic operators (primitive coercion is inline ToNumber)
const s = "5";
console.log(s * 1);
const b = true;
console.log(b * 2);
const n = null;
console.log(n * 2);
