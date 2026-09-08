// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: console
// Node draws a Map or a Set with an `(iteration index)` column -- and a Map with a second `Key`
// column -- which is a DIFFERENT table, not a wider one. Refusing it is what keeps the runtime
// from drawing a grid Node does not; the array and object forms are what landed.

console.table(new Map([['k', 1]]));
