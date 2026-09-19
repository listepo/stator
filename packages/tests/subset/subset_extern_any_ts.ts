// @mode: ts
// @verdict: error
// @code: STA1114
// SUBSET.md: FFI — explicit `any` in an extern signature (docs/FFI.md section 2). A ts.Type
// carries no explicit/implicit memory, so types.ts maps every `any` to Unknown and the
// unknown arm of classifyPosition refuses it as STA1114. The declaration lives in
// helper_extern_any.d.ts — where the gate reads it — so the mode-wide STA1001 walk over
// the entry file and the STA1121 placement arm never fire.
/// <reference path="./helper_extern_any.d.ts" />

console.log(cTakeAny(1));
export {};
