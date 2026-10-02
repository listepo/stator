// @mode: ts
// @verdict: static
// SUBSET.md: FFI — `Uint8Array` parameter (docs/FFI.md section 2, plan.md section 11c T11.3a).
// The view crosses as pointer + length into its own storage: one direct C call, no copy, no
// check (the view is proven), with the unchecked-boundary flag alongside (docs/FFI.md section 5).
/// <reference path="./helper_extern_bytes.d.ts" />

const buf = new Uint8Array(8);
console.log(extFill(buf.subarray(2), 7));
console.log(extSum(buf));
export {};
