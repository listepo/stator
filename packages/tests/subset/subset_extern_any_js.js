// @mode: js
// @verdict: error
// @code: STA1114
// @expected-fail: true
// SUBSET.md: FFI — explicit `any` in an extern signature (docs/FFI.md section 2: like
// `unknown`, it would need boxing). The declaration (/** @statorExtern */ declare function
// cTakeAny(x: any): number;) lands in helper_extern_ffi.d.ts with Task 7.1 step 10; until
// then the reference below dangles.
/// <reference path="./helper_extern_ffi.d.ts" />

console.log(cTakeAny(1));
