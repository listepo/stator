// @mode: ts
// @verdict: static
// SUBSET.md: FFI — branded-pointer CHAIN (docs/FFI.md section 2 `T*` row): open returns the
// handle, query and close each consume it. The triple lives whole in helper_extern_chain.d.ts
// (a `.d.ts`, so the gate reads each marker where it is written; kept whole there because
// splitting across the shared helpers would duplicate `type sqlite3`). Step 6 compiles it
// borrow-only: each handle crosses as void* in its frame slot, untouched and unretained, so
// the calls are direct C calls — static, with the unchecked-boundary flag alongside
// (docs/FFI.md section 5).
/// <reference path="./helper_extern_chain.d.ts" />

const h: sqlite3 = extOpenDb("app.db" as CString);
console.log(extQuery(h));
extClose(h);
export {};
