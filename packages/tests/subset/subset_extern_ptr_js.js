// @mode: js
// @verdict: static
// SUBSET.md: FFI — branded pointer in an extern signature (docs/FFI.md section 2 `T*` row),
// called from untyped code. The verdict is about the SIGNATURE, not the caller, so it matches
// the ts twin: borrow-only pass-through is a direct C call either way, with the
// unchecked-boundary flag alongside (docs/FFI.md section 5).
/// <reference path="./helper_extern_ptr.d.ts" />

const db = extOpenDb(7);
console.log(extDbVersion(db));
extCloseDb(db);
