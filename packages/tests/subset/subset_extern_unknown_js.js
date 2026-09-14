// @mode: js
// @verdict: error
// @code: STA1114
// @expected-fail: true
// SUBSET.md: FFI — `unknown` in an extern signature (docs/FFI.md section 2). The declaration
// (/** @statorExtern */ declare function cTakeUnknown(x: unknown): number;) lands in
// helper_extern_ffi.d.ts with Task 7.1 step 10; until then the reference below dangles.
/// <reference path="./helper_extern_ffi.d.ts" />

console.log(cTakeUnknown(1));
