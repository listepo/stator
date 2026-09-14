// @mode: ts
// @verdict: error
// @code: STA0012
// SUBSET.md: FFI — opaque VALUE uses of a branded pointer (docs/FFI.md section 2 `T*` row):
// arithmetic on a handle is a checker error (the branded TABLE type is not a number operand),
// which holds the step-6 line by construction: a handle is neither a number nor an arithmetic
// operand, and no representation change can make `h + 1` well-typed.
/// <reference path="./helper_extern_ptr.d.ts" />

const h: sqlite3 = { __brand: "sqlite3" } as sqlite3;
console.log(h);
console.log(h + 1);
export {};
