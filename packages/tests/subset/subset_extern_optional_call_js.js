// @mode: js
// @verdict: static
// SUBSET.md: FFI — an optional call to an extern is a direct call (docs/FFI.md section 5).
// Literals are typed even in untyped code, so no boundary check is owed; `?.` is a proven
// no-op on an always-linked callee and compiles exactly like the plain form (Phase 7
// close-out).
/// <reference path="./helper_extern_direct.d.ts" />

console.log(extSqrt?.(4));
console.log(extFmod?.(5.5, 2));
