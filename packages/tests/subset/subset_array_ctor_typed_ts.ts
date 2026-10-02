// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: `Array(n)`, `new Array(...)` and array holes

// A typed element has no value that could stand for a hole, so a length with one is deferred.
const xs = new Array<number>(3);
console.log(xs.length);
