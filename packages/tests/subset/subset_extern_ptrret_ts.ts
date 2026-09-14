// @mode: ts
// @verdict: not-yet
// @code: STA1217
// @expected-fail: true
// SUBSET.md: FFI — branded-pointer RETURN (docs/FFI.md section 2 `T*` row). The return arm
// classifies exactly like the parameter arm (extern.ts classifyPosition: the brand test runs
// before the position split), so this declaration earns STA1217 — once Task 7.1 step 10
// extracts it into helper_extern_ffi.d.ts. Inline, the gate answers STA1121 instead.
type CString = string & { readonly __statorCstr: "CString" };
type sqlite3 = { readonly __brand: "sqlite3" };
/** @statorExtern */
declare function extOpenDb(path: CString): sqlite3;

console.log(extOpenDb("app.db" as CString));
export {};
