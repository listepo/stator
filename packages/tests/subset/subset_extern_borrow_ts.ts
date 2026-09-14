// @mode: ts
// @verdict: static
// SUBSET.md: FFI — branded-pointer parameter forwarded through a binding (docs/FFI.md
// section 2 `T*` row). A handle from one call crosses into another through a TS function:
// borrow-only means no position retains it, and a plain call only forwards it, so the whole
// chain stays a direct C call — static, with the unchecked-boundary flag alongside.
/// <reference path="./helper_extern_ptr.d.ts" />

function version(db: sqlite3): number {
  return extDbVersion(db);
}
const db = extOpenDb(2);
console.log(version(db));
extCloseDb(db);
export {};
