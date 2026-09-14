// @mode: ts
// @verdict: error
// @code: STA1119
// SUBSET.md: FFI — a malformed @statorLink header pragma (docs/FFI.md section 9). The header
// arrives unquoted, so the gate refuses the line where it is written instead of guessing:
// link configuration is permanent surface, never a schedule.
/// <reference path="./helper_extern_link_bad.d.ts" />

console.log(extF());
export {};
