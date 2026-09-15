// @mode: ts
// @verdict: error
// @code: STA0012
// SUBSET.md: FFI — Out<T> slot passed where a brand value is required (docs/FFI.md
// section 2: a slot is an address, not the handle; reading the handle spells .value).
// The checker owns ts mode (STA0012, like extern arity); the js twin pins STA1125 where
// the checker is silent. Twin: subset_out_arg_mismatch_ts.ts covers the reverse direction.
/// <reference path="./helper_extern_out.d.ts" />

const s = outSlot<Db>();
console.log(dbVersion(s));
export {};
