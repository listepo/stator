// @mode: ts
// @verdict: error
// @code: STA1125
// SUBSET.md: FFI — Out<T> with a non-brand inner (docs/FFI.md section 2: the slot must wrap
// a branded pointer; a number has no C address the call could write through).
/// <reference path="./helper_extern_out.d.ts" />

const s = outSlot<number>();
console.log(s.value);
export {};
