// @mode: js
// @verdict: not-yet
// @code: STA1217
// @expected-fail: true
// SUBSET.md: FFI — string return into untyped code (copied at the boundary, docs/FFI.md
// section 3). The declaration lives in helper_extern_cstr.d.ts; the gate reports the call
// site until steps 5+ land it.
/// <reference path="./helper_extern_cstr.d.ts" />

console.log(cEcho("hello"));
