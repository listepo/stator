// @mode: js
// @verdict: not-yet
// @code: STA1217
// @expected-fail: true
// SUBSET.md: FFI — branded-pointer return (docs/FFI.md section 2 `T*` row). The declaration
// (type sqlite3 = { readonly __brand: "sqlite3" }; /** @statorExtern */ declare function
// extOpenDb(path: CString): sqlite3;) lands in helper_extern_ffi.d.ts with Task 7.1 step 10;
// until then the reference below dangles.
/// <reference path="./helper_extern_ffi.d.ts" />

console.log(extOpenDb("app.db"));
