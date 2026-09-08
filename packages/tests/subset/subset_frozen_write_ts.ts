// @mode: ts
// @verdict: error
// @code: STA0012
// SUBSET.md: write through a frozen reference
const frozen = Object.freeze({ a: 1 });
frozen.a = 2;
console.log(frozen.a);
