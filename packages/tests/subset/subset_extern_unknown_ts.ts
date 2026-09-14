// @mode: ts
// @verdict: error
// @code: STA1114
// @expected-fail: true
// SUBSET.md: FFI — `unknown` in an extern signature (docs/FFI.md section 2: it would need
// boxing, so it is refused rather than silently boxed). The declaration is inline until Task
// 7.1 step 10 extracts it into helper_extern_ffi.d.ts; a landed gate reading the marker
// outside a .d.ts would answer STA1121 instead — see the delivery report.
/** @statorExtern */
declare function cTakeUnknown(x: unknown): number;

console.log(cTakeUnknown(1));
export {};
