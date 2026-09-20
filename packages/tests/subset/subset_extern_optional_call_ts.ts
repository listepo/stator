// @mode: ts
// @verdict: static
// SUBSET.md: FFI — an optional call to an extern is a direct call (docs/FFI.md section 5).
// The callee always links, so `?.` is a proven no-op rather than a conditional the
// lowering must model; the call compiles exactly like the plain form (Phase 7 close-out).
/// <reference path="./helper_extern_direct.d.ts" />

console.log(extSqrt?.(4));
console.log(extFmod?.(5.5, 2));
export {};
