// @mode: ts
// @verdict: error
// @code: STA1117
// @expected-fail: true
// SUBSET.md: FFI — function/closure type in an extern signature (docs/FFI.md section 2: v0
// has no trampoline; C calls in via Task 7.2 exports instead). The declaration is inline
// until Task 7.1 step 10 extracts it into helper_extern_ffi.d.ts; a landed gate reading the
// marker outside a .d.ts would answer STA1121 instead — see the delivery report.
/** @statorExtern */
declare function cTakeFn(cb: (x: number) => number): number;

console.log(cTakeFn((x) => x + 1));
export {};
