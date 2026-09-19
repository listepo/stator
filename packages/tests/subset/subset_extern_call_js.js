// @mode: js
// @verdict: static
// SUBSET.md: FFI — extern call happy path from untyped code (docs/FFI.md section 2).
// The declaration (/** @statorExtern */ declare function cAdd(a: number, b: number):
// number;) lives in helper_extern_call.d.ts — the shared per-kind helper (one file,
// one verdict family) — where the gate reads the marker where it is written, so the
// shared-helper STA1114 walk is gone and the call lowers to a direct C call. Doubles
// as the unchecked-boundary fixture (docs/FFI.md section 5): the flag rides alongside
// this verdict, but the current explain schema reports verdict + code only, so the
// flag itself is not yet observable.
/// <reference path="./helper_extern_call.d.ts" />

console.log(cAdd(1, 2));
