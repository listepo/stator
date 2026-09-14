// @mode: js
// @verdict: error
// @code: STA1116
// @expected-fail: true
// SUBSET.md: FFI — array type in an extern signature (docs/FFI.md section 2). The declaration
// (/** @statorExtern */ declare function cTakeArray(a: number[]): number;) lands in
// helper_extern_ffi.d.ts with Task 7.1 step 10; until then the reference below dangles.
/// <reference path="./helper_extern_ffi.d.ts" />

console.log(cTakeArray([1, 2, 3]));
