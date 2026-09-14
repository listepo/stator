// @mode: js
// @verdict: error
// @code: STA0012
// SUBSET.md: FFI — opaque VALUE uses of a branded pointer from untyped code (docs/FFI.md
// section 2 `T*` row): arithmetic on a handle is a checker error in both modes (the inferred
// object type is not a number operand), which holds the step-6 line by construction.
/// <reference path="./helper_extern_ptr.d.ts" />

const h = { __brand: "sqlite3" };
console.log(h);
console.log(h + 1);
