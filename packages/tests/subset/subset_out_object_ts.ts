// @mode: ts
// @verdict: error
// @code: STA1125
// SUBSET.md: FFI — Out<T> slot stored in an object literal and an array (docs/FFI.md
// section 2: slots live only in locals, never in aggregates that could outlive the call).
/// <reference path="./helper_extern_out.d.ts" />

const s = outSlot<Db>();
const box = { slot: s };
const list = [s];
console.log(box.slot.value, list.length);
export {};
