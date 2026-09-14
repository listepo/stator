// @mode: js
// @verdict: static
// SUBSET.md: FFI — branded-pointer return (docs/FFI.md section 2 `T*` row), called from
// untyped code. The verdict is about the SIGNATURE, not the caller, so it matches the ts
// twin: one direct C call, with the unchecked-boundary flag alongside (docs/FFI.md section 5).
/// <reference path="./helper_extern_ptrret.d.ts" />

console.log(extOpenDb("app.db"));
