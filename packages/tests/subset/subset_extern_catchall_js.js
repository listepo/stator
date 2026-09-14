// @mode: js
// @verdict: error
// @code: STA1119
// @expected-fail: true
// SUBSET.md: FFI — catch-all for types outside the ABI table, here `void` as a parameter
// (docs/FFI.md section 2 table). The declaration (/** @statorExtern */ declare function
// cTakeVoid(v: void): number;) lands in helper_extern_ffi.d.ts with Task 7.1 step 10; until
// then the reference below dangles.
/// <reference path="./helper_extern_ffi.d.ts" />

console.log(cTakeVoid(undefined));
