// @mode: js
// @verdict: static
// SUBSET.md: FFI — extern calls with opted-in error conventions (docs/FFI.md section 4),
// statically-typed arguments, so static + unchecked-boundary flag (docs/FFI.md section 5).
/// <reference path="./helper_extern_direct.d.ts" />

console.log(extChecked(0));
console.log(extErrno(4));
