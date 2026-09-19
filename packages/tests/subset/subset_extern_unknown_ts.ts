// @mode: ts
// @verdict: error
// @code: STA1114
// SUBSET.md: FFI — `unknown` in an extern signature (docs/FFI.md section 2: it would need
// boxing, so it is refused rather than silently boxed). The declaration lives in
// helper_extern_unknown.d.ts — where the gate reads it — so the STA1121 placement arm
// for an inline marker never fires.
/// <reference path="./helper_extern_unknown.d.ts" />

console.log(cTakeUnknown(1));
export {};
