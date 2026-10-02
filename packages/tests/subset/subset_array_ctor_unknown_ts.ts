// @mode: ts
// @verdict: dynamic
// SUBSET.md: `Array(n)`, `new Array(...)` and array holes

// An Unknown element may be missing: the length form, a write past the end and `delete` all
// leave holes, and a read of one answers `undefined`.
const xs = new Array<unknown>(2);
xs[3] = 1;
delete xs[3];
const pair = Array(1, 2);
const one = new Array<string>('a');
console.log(xs.length, 3 in xs, 0 in xs, pair, one);
