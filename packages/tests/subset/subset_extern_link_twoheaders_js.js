// @mode: js
// @verdict: error
// @code: STA1119
// SUBSET.md: FFI — two @statorLink headers in one binding file (docs/FFI.md section 9),
// referenced from untyped code. The refusal is about the FILE, not the caller, so the verdict
// matches the ts twin.
/// <reference path="./helper_extern_link_twoheaders.d.ts" />

console.log(extF());
