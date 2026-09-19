// Shared declarations for the subset_extern_any_ts decision fixture (docs/FFI.md
// section 2): explicit `any` in an extern signature. A ts.Type carries no
// explicit/implicit memory, so types.ts maps every `any` to Unknown and the unknown arm
// of classifyPosition refuses it as STA1114. Kept apart from the accepted helpers (whose
// only-accepted rule the refusal would violate) and from helper_extern_ffi.d.ts: one
// file, one verdict family (cf. helper_extern_ptrret.d.ts). The C symbol never needs to
// exist: decision fixtures run `explain`, never a link.

/** @statorExtern */
declare function cTakeAny(x: any): number;
