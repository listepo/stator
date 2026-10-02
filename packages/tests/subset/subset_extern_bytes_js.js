// @mode: js
// @verdict: static
// SUBSET.md: FFI — `Uint8Array` parameter (docs/FFI.md section 2), called from untyped code
// with a value the checker still infers as a view. Same as the ts twin: one direct C call, no
// check, with the unchecked-boundary flag alongside.
/// <reference path="./helper_extern_bytes.d.ts" />

const buf = new Uint8Array(8);
console.log(extFill(buf.subarray(2), 7));
console.log(extSum(buf));
