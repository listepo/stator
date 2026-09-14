// @mode: ts
// @verdict: static
// SUBSET.md: FFI — branded pointer in an extern signature (docs/FFI.md section 2 `T*` row).
// Step 6 compiles it borrow-only: the handle crosses as void* in its frame slot, untouched
// and unretained, so the call is a direct C call — static, with the unchecked-boundary flag
// alongside (docs/FFI.md section 5).
/// <reference path="./helper_extern_ptr.d.ts" />

const db = extOpenDb(7);
console.log(extDbVersion(db));
extCloseDb(db);
export {};
