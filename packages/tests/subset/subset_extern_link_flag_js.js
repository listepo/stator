// @mode: js
// @verdict: error
// @code: STA1119
// SUBSET.md: FFI — a @statorLink pragma flag outside the link allowlist (docs/FFI.md section
// 9), named from untyped code. The refusal is about the FILE, not the caller, so the verdict
// matches the ts twin: the build stops at the pragma line either way.
/// <reference path="./helper_extern_link_flag.d.ts" />

console.log(extF());
