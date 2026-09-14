// @mode: js
// @verdict: not-yet
// @code: STA1217
// SUBSET.md: FFI — branded-pointer parameter forwarded through a binding, called from
// untyped code (docs/FFI.md section 2 `T*` row). The deferral is about the SIGNATURE, not
// the caller, so the verdict matches the ts twin: no representation exists to check against.
/// <reference path="./helper_extern_ptr.d.ts" />

const db = { __brand: "sqlite3" };
console.log(extDbVersion(db));
