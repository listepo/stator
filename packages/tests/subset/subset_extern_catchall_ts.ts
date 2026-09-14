// @mode: ts
// @verdict: error
// @code: STA1119
// @expected-fail: true
// SUBSET.md: FFI — catch-all for types outside the ABI table, here `void` as a parameter
// (docs/FFI.md section 2 table: `void` is return-position only). The declaration is inline
// until Task 7.1 step 10 extracts it into helper_extern_ffi.d.ts; a landed gate reading the
// marker outside a .d.ts would answer STA1121 instead — see the delivery report.
/** @statorExtern */
declare function cTakeVoid(v: void): number;

console.log(cTakeVoid(undefined));
export {};
