// @mode: js
// @verdict: not-yet
// @code: STA1217
// @expected-fail: true
// SUBSET.md: FFI — extern call happy path from untyped code (docs/FFI.md section 2). The
// declaration (/** @statorExtern */ declare function cAdd(a: number, b: number): number;)
// lands in helper_extern_ffi.d.ts with Task 7.1 step 10; until then the reference below
// dangles. Doubles as the unchecked-boundary fixture (docs/FFI.md section 5): the flag rides
// alongside this verdict, but the current explain schema reports verdict + code only, so the
// flag itself is not yet observable.
/// <reference path="./helper_extern_ffi.d.ts" />

console.log(cAdd(1, 2));
