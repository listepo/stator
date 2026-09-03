// @mode: ts
// @verdict: error
// @code: STA0012
// SUBSET.md: array index access

// The same source in ts mode: `noUncheckedIndexedAccess` is the contract that lets ts mode trust
// types, so the miss must be handled where it is written. The js fixture is the other half.
const xs: number[] = [10, 20, 30];
const i: number = 1;
console.log(xs[i] + 1);
