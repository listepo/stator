// @mode: ts
// @verdict: error
// @code: STA0012
// SUBSET.md: FFI — extern call with the wrong argument count. A C call has fixed arity, and
// in `ts` mode the checker's own arity diagnostic owns the message (the same STA0012 an
// ordinary mismatched call earns); the gate refuses it in `js` mode, where that diagnostic
// is suppressed (subset_extern_arity_js).
/// <reference path="./helper_extern_direct.d.ts" />

console.log(extSqrt(1, 2));
export {};
