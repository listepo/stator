// @mode: ts
// @verdict: error
// @code: STA1114
// @expected-fail: true
// SUBSET.md: FFI — explicit `any` in an extern signature (docs/FFI.md section 2). A ts.Type
// carries no explicit/implicit memory, so types.ts maps every `any` to Unknown and the
// unknown arm of classifyPosition refuses it as STA1114 — once Task 7.1 step 10 extracts the
// declaration into helper_extern_ffi.d.ts. Inline, the mode-wide STA1001 walk and the STA1121
// placement arm answer first.
/** @statorExtern */
declare function cTakeAny(x: any): number;

console.log(cTakeAny(1));
export {};
