// @mode: ts
// @verdict: error
// @code: STA1119
// SUBSET.md: FFI — error convention that does not fit the return (docs/FFI.md section 4).
// `nonzero`/`negative` read a numeric return, `null` a pointer one; a boolean carries
// neither, so the combination is outside the table.
/// <reference path="./helper_extern_convmismatch.d.ts" />

console.log(extFlag(1));
export {};
