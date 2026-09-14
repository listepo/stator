// @mode: js
// @verdict: error
// @code: STA1119
// SUBSET.md: FFI — misspelled `@statorError` convention (docs/FFI.md section 4), called from
// untyped code. The convention is a property of the DECLARATION, so the verdict is the same
// error in both modes.
/// <reference path="./helper_extern_badconv.d.ts" />

console.log(extTypo(0));
