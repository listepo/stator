// @mode: js
// @verdict: static
// SUBSET.md: FFI — string argument from typed code (CString borrow, docs/FFI.md
// section 3). The declaration lives in helper_extern_cstr.d.ts; steps 4–5 lower the call
// site to a direct C call.
/// <reference path="./helper_extern_cstr.d.ts" />

console.log(cStrLen("hello"));
