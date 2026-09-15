// @mode: ts
// @verdict: error
// @code: STA0012
// SUBSET.md: FFI — assigning to slot.value (docs/FFI.md section 2: the slot reads through
// .value; the write direction belongs to the C call). This pins the checker's STA0012, not
// STA1125: an isolated readonly-assign probe reports error STA0012 (TS2540 passed through),
// and once outSlot resolves that is the only diagnostic left. Today the file reports
// not-yet STA1214 (the ambient outSlot declare dominates), so it waits with the rest.
/// <reference path="./helper_extern_out.d.ts" />

const s = outSlot<Db>();
const t = outSlot<Db>();
s.value = t.value;
console.log(s.value);
export {};
