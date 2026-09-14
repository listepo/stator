// @mode: ts
// @verdict: error
// @code: STA1116
// @expected-fail: true
// SUBSET.md: FFI — array type in an extern signature (docs/FFI.md section 2: a managed array
// is not a C buffer; spell pointer + length as ABI types). The declaration is inline until
// Task 7.1 step 10 extracts it into helper_extern_ffi.d.ts; a landed gate reading the marker
// outside a .d.ts would answer STA1121 instead — see the delivery report.
/** @statorExtern */
declare function cTakeArray(a: number[]): number;

console.log(cTakeArray([1, 2, 3]));
export {};
