// @mode: js
// @verdict: not-yet
// @code: STA1217
// SUBSET.md: FFI — branded pointer in an extern signature (docs/FFI.md section 2 `T*` row),
// called from untyped code. The deferral is about the SIGNATURE, not the caller, so the
// verdict is the same not-yet in both modes: no representation exists to check against.
/// <reference path="./helper_extern_ptr.d.ts" />

console.log(extDbVersion({ __brand: "sqlite3" }));
