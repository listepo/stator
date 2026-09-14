// @mode: js
// @verdict: error
// @code: STA1119
// SUBSET.md: FFI — error convention that does not fit the return (docs/FFI.md section 4),
// called from untyped code. The mismatch is in the declaration, so both modes agree.
/// <reference path="./helper_extern_convmismatch.d.ts" />

console.log(extFlag(1));
