// @mode: ts
// @verdict: error
// @code: STA1120
// @expected-fail: true
// SUBSET.md: FFI — variadic (`printf`-style) extern declaration (docs/FFI.md section 2: no
// sound signature, permanent — plan section 10 out-of-scope table). TypeScript spells it as
// a rest parameter. The declaration is inline until Task 7.1 step 10 extracts it into
// helper_extern_ffi.d.ts; a landed gate reading the marker outside a .d.ts would answer
// STA1121 instead — see the delivery report.
/** @statorExtern */
declare function cSum(first: number, ...rest: number[]): number;

console.log(cSum(1, 2, 3));
export {};
