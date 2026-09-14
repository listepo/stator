// @mode: ts
// @verdict: not-yet
// @code: STA1217
// @expected-fail: true
// SUBSET.md: FFI — branded-pointer CHAIN (docs/FFI.md section 2 `T*` row): open returns the
// handle, query and close each consume it. The triple is declared inline because neither
// shared helper carries it whole (helper_extern_ffi.d.ts has the return, helper_extern_ptr.d.ts
// the borrow, and referencing both would duplicate `type sqlite3`); inline, the gate answers
// STA1121 instead (placement, docs/FFI.md section 1). The pin names the STA1217 step 6 must
// produce once the triple lives in a `.d.ts`.
type CString = string & { readonly __statorCstr: "CString" };
type sqlite3 = { readonly __brand: "sqlite3" };
/** @statorExtern */
declare function extOpenDb(path: CString): sqlite3;
/** @statorExtern */
declare function extQuery(db: sqlite3): number;
/** @statorExtern */
declare function extClose(db: sqlite3): void;

const h: sqlite3 = extOpenDb("app.db" as CString);
console.log(extQuery(h));
extClose(h);
export {};
