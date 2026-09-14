// @mode: ts
// @verdict: error
// @code: STA1115
// @expected-fail: true
// SUBSET.md: FFI — object type in an extern signature (docs/FFI.md section 2: no C layout to
// pass; a C-owned struct is a branded pointer, text is CString). The declaration is inline
// until Task 7.1 step 10 extracts it into helper_extern_ffi.d.ts; a landed gate reading the
// marker outside a .d.ts would answer STA1121 instead — see the delivery report.
/** @statorExtern */
declare function cTakeObject(o: { x: number }): number;

console.log(cTakeObject({ x: 1 }));
export {};
