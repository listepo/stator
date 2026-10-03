// @mode: js
// @verdict: dynamic
// SUBSET.md: `Array(n)`, `new Array(...)` and array holes

// `new Array(3)` is three holes; a write past the end and a `delete` make more. A hole reads as
// `undefined`, is not `in` the array, and prints as `<n empty items>` (docs/VALUE.md §4.4).
const a = new Array(3);
a[5] = 'x';
a[1] = 'y';
delete a[1];
console.log(a, a.length, 1 in a, 5 in a, [...a]);
console.log(Array(1, 2), new Array('s'));
