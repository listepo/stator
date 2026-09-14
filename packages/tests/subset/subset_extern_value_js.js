// @mode: js
// @verdict: not-yet
// @code: STA1217
// SUBSET.md: FFI — an extern name in value position (docs/FFI.md section 1). Reading one
// as a value needs a closure over a C symbol, which v0 has no trampoline for; the direct
// call is the only compiled position.
/// <reference path="./helper_extern_direct.d.ts" />

const fn = extSqrt;
console.log(typeof fn);
