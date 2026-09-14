// @mode: js
// @verdict: static
// SUBSET.md: FFI — @statorError null on a branded-pointer return (docs/FFI.md section 4),
// called from untyped code. The verdict is about the SIGNATURE, not the caller, so it matches
// the ts twin: one guarded direct C call, with the unchecked-boundary flag alongside.
/// <reference path="./helper_extern_ptr.d.ts" />

try {
  const db = extOpenMaybe(1);
  console.log(extDbVersion(db));
  extCloseDb(db);
} catch (e) {
  console.log("no db");
}
