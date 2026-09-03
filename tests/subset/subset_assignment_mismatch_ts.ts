// @mode: ts
// @verdict: error
// @code: STA0012
// SUBSET.md: dynamic reassignment
let value = 1;
value = 'text';
console.log(value);
