// Shared declarations for the subset_extern_ptrret_* decision fixtures (docs/FFI.md
// section 2): a branded-pointer RETURN behind a CString parameter — the allocator shape (C
// gives, C owns). Kept apart from helper_extern_ffi.d.ts, whose refusal rows would otherwise
// taint every verdict sharing the file: one file, one verdict family.

/** Borrowed NUL-terminated UTF-8 at the FFI boundary (docs/FFI.md section 3). */
type CString = string & { readonly __statorCstr: "CString" };

/** An opaque handle owned by the C library, never dereferenced by generated code. */
type sqlite3 = { readonly __brand: "sqlite3" };

/** @statorExtern */
declare function extOpenDb(path: CString): sqlite3;
