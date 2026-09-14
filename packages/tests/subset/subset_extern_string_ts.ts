// @mode: ts
// @verdict: error
// @code: STA1118
// @expected-fail: true
// SUBSET.md: FFI — bare `string` in an extern signature (docs/FFI.md section 2: UTF-16 in,
// bytes out is never inferred; use CString or CStringOwned). The declaration is inline until
// Task 7.1 step 10 extracts it into helper_extern_ffi.d.ts; a landed gate reading the marker
// outside a .d.ts would answer STA1121 instead — see the delivery report.
/** @statorExtern */
declare function cTakeString(s: string): number;

console.log(cTakeString("hello"));
export {};
