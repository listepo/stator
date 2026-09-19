// @mode: js
// @verdict: error
// @code: STA1114
// SUBSET.md: FFI — explicit `any` in an extern signature (docs/FFI.md section 2: like
// `unknown`, it would need boxing). The declaration (/** @statorExtern */ declare
// function cTakeAny(x: any): number;) lives in helper_extern_any.d.ts — the shared
// per-kind helper (one file, one verdict family) — where the gate reads it, so the
// verdict is this row's own STA1114 rather than the shared helper's walk.
/// <reference path="./helper_extern_any.d.ts" />

console.log(cTakeAny(1));
