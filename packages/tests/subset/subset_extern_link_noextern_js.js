// @mode: js
// @verdict: error
// @code: STA1119
// SUBSET.md: FFI — a @statorLink pragma in a file with no @statorExtern declaration
// (docs/FFI.md section 9), referenced from untyped code. The refusal is about the FILE, not
// the caller, so the verdict matches the ts twin.
/// <reference path="./helper_extern_link_noextern.d.ts" />

console.log(1);
