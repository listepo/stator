// Shared declarations for the subset_extern_ptrchain_{ts,js} decision fixtures (docs/FFI.md
// section 2 `T*` row): the branded-pointer CHAIN — open returns the handle, query and
// close each consume it. Kept whole in one file (splitting across helper_extern_ffi.d.ts
// and helper_extern_ptr.d.ts would duplicate `type sqlite3`) and apart from the refusal
// rows: one file, one verdict family (cf. helper_extern_ptrret.d.ts). The C symbols never
// need to exist: decision fixtures run `explain`, never a link.

/** Borrowed NUL-terminated UTF-8 at the FFI boundary (docs/FFI.md section 3). */
type CString = string & { readonly __statorCstr: "CString" };

/** An opaque handle owned by the C library, never dereferenced by generated code. */
type sqlite3 = { readonly __brand: "sqlite3" };

/** @statorExtern */
declare function extOpenDb(path: CString): sqlite3;

/** @statorExtern */
declare function extQuery(db: sqlite3): number;

/** @statorExtern */
declare function extClose(db: sqlite3): void;
