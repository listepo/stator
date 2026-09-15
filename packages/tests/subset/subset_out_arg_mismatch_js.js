// @mode: js
// @verdict: error
// @code: STA1125
// SUBSET.md: FFI — brand value passed where an Out<T> slot is required, from untyped code
// (docs/FFI.md section 2). Twin: subset_out_slot_to_brand_js.js covers the reverse direction.
// Declarations ride the shared helper.
/// <reference path="./helper_extern_out.d.ts" />

/** @type {Out<Db>} */
const s = outSlot();
/** @type {Db} */
const db = s.value;
fakeOpen("test.db", db);
console.log(db);
