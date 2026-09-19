// @mode: js
// @verdict: error
// @code: STA1114
// SUBSET.md: FFI — `unknown` in an extern signature (docs/FFI.md section 2). The
// declaration (/** @statorExtern */ declare function cTakeUnknown(x: unknown): number;)
// lives in helper_extern_unknown.d.ts — the shared per-kind helper (one file, one
// verdict family) — where the gate reads it, so the verdict is this row's own STA1114
// rather than the shared helper's walk.
/// <reference path="./helper_extern_unknown.d.ts" />

console.log(cTakeUnknown(1));
