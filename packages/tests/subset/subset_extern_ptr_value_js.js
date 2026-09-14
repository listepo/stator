// @mode: js
// @verdict: not-yet
// @code: STA1217
// SUBSET.md: FFI — a handle-creating extern in value position (docs/FFI.md section 1),
// named from untyped code. The refusal is about the POSITION, not the caller, so the verdict
// matches the ts twin: only the direct call compiles, never the alias.
/// <reference path="./helper_extern_ptr.d.ts" />

const opener = extOpenDb;
console.log(typeof opener);
