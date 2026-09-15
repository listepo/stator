// @mode: ts
// @verdict: error
// @code: STA1125
// SUBSET.md: FFI — Out<T> slot returned from a function (docs/FFI.md section 2: slots live
// only in locals; escaping through a return would outlive the address the call wrote to).
/// <reference path="./helper_extern_out.d.ts" />

function makeSlot(): Out<Db> {
  return outSlot<Db>();
}
console.log(makeSlot().value);
export {};
