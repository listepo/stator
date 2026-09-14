// @mode: js
// @verdict: error
// @code: STA1120
// @expected-fail: true
// SUBSET.md: FFI — variadic (`printf`-style) extern declaration (docs/FFI.md section 2,
// permanent). The declaration (/** @statorExtern */ declare function cSum(first: number,
// ...rest: number[]): number;) lands in helper_extern_ffi.d.ts with Task 7.1 step 10; until
// then the reference below dangles.
/// <reference path="./helper_extern_ffi.d.ts" />

console.log(cSum(1, 2, 3));
