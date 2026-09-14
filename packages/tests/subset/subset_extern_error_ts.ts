// @mode: ts
// @verdict: static
// SUBSET.md: FFI — extern calls with opted-in error conventions (docs/FFI.md section 4).
// The convention changes what the call CHECKS, not the verdict: a checked call over typed
// arguments is still static, with the unchecked-boundary flag alongside it.
/// <reference path="./helper_extern_direct.d.ts" />

console.log(extChecked(0));
console.log(extErrno(4));
export {};
