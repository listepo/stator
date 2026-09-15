// @mode: ts
// @verdict: error
// @code: STA0012
// SUBSET.md: FFI — brand value passed where an Out<T> slot is required (docs/FFI.md
// section 2: a brand names a live handle; only a slot carries an address the call can
// write through). The checker owns ts mode (STA0012, like extern arity); the js twin pins
// STA1125 where the checker is silent. Twin: subset_out_slot_to_brand_ts.ts covers the
// reverse direction.
/// <reference path="./helper_extern_out.d.ts" />

const s = outSlot<Db>();
const db: Db = s.value;
const rc = fakeOpen("test.db" as CString, db);
console.log(rc);
export {};
