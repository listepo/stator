// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: `Array(n)`, `new Array(...)` and array holes

// The checker types this array `number[]`, and a typed element cannot hold a hole.
const xs = [1, 2, 3];
delete xs[0];
console.log(xs);
