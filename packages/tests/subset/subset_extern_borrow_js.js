// @mode: js
// @verdict: static
// SUBSET.md: FFI — branded-pointer parameter forwarded through a binding, called from
// untyped code (docs/FFI.md section 2 `T*` row). The JSDoc types are the free static path
// (MODES.md): with the handle's brand spelled, the forwarding compiles exactly as the ts
// twin — one direct C call per crossing, with the unchecked-boundary flag alongside.
/// <reference path="./helper_extern_ptr.d.ts" />

/**
 * @param {sqlite3} db
 * @returns {number}
 */
function version(db) {
  return extDbVersion(db);
}
const db = extOpenDb(2);
console.log(version(db));
extCloseDb(db);
