// @mode: ts
// @verdict: not-yet
// @code: STA1217
// @expected-fail: true
// SUBSET.md: FFI — extern call happy path over ABI scalar types (docs/FFI.md section 2).
// The declaration is inline until Task 7.1 step 10 extracts it into a helper .d.ts (the gate
// skips declaration files, so only the call site meets it). Doubles as the unchecked-boundary
// fixture (docs/FFI.md section 5): the flag rides alongside this verdict, but the current
// explain schema reports verdict + code only, so the flag itself is not yet observable.
/** @statorExtern */
declare function cAdd(a: number, b: number): number;

console.log(cAdd(1, 2));
export {};
