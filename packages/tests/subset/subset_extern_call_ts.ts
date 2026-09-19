// @mode: ts
// @verdict: static
// SUBSET.md: FFI — extern call happy path over ABI scalar types (docs/FFI.md section 2).
// The declaration lives in helper_extern_call.d.ts (a `.d.ts`, so the gate reads the
// marker where it is written); the call lowers to a direct C call with no `jsrt_value`
// on the way out. Doubles as the unchecked-boundary fixture (docs/FFI.md section 5):
// the flag rides alongside this verdict, but the current explain schema reports verdict
// + code only, so the flag itself is not yet observable.
/// <reference path="./helper_extern_call.d.ts" />

console.log(cAdd(1, 2));
export {};
