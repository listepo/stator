// @mode: js
// @verdict: error
// @code: STA1119
// SUBSET.md: FFI — `Uint8Array` as an extern RETURN (docs/FFI.md section 2), called from
// untyped code. The refusal is about the SIGNATURE, not the caller, so it matches the ts twin.
/// <reference path="./helper_extern_bytesret.d.ts" />

console.log(extMake(4));
