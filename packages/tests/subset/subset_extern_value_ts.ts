// @mode: ts
// @verdict: not-yet
// @code: STA1217
// SUBSET.md: FFI — an extern name in value position (docs/FFI.md section 1). An extern has
// no VALUE to alias, pass, or read; only the direct call compiles, so every other position
// stays not-yet rather than building a closure over a C symbol.
/// <reference path="./helper_extern_direct.d.ts" />

const fn = extSqrt;
console.log(typeof fn);
export {};
