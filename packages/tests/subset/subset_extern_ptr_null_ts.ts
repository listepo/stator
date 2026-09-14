// @mode: ts
// @verdict: static
// SUBSET.md: FFI — @statorError null on a branded-pointer return (docs/FFI.md section 4).
// A NULL handle throws before it can become a value, so the guarded call is still one direct
// C call — static, with the unchecked-boundary flag alongside.
/// <reference path="./helper_extern_ptr.d.ts" />

try {
  const db = extOpenMaybe(1);
  console.log(extDbVersion(db));
  extCloseDb(db);
} catch (e) {
  console.log("no db");
}
export {};
