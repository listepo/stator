// @mode: js
// @verdict: error
// @code: STA1125
// SUBSET.md: FFI — Out<T> slot passed where a brand value is required, from untyped code
// (docs/FFI.md section 2). Twin: subset_out_arg_mismatch_js.js covers the reverse direction.
// Declarations ride the shared helper.
/// <reference path="./helper_extern_out.d.ts" />

/** @type {Out<Db>} */
const s = outSlot();
console.log(dbVersion(s));
