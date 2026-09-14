// Shared declarations for the subset_extern_link_pragma_* decision fixtures (docs/FFI.md
// section 9): a binding file carrying both pragma forms — link flags and a header. Decision
// fixtures run `explain`, never a link, so the library and the header never need to exist:
// the gate validates the spelling, and the verdict proves the calls compile around it.

// @statorLink: -lsqlite3
// @statorLink #include <sqlite3.h>

/** Borrowed NUL-terminated UTF-8 at the FFI boundary (docs/FFI.md section 3). */
type CString = string & { readonly __statorCstr: "CString" };

/** An opaque handle owned by the C library, never dereferenced by generated code. */
type sqlite3 = { readonly __brand: "sqlite3" };

/** @statorExtern sqlite3_open */
declare function extOpen(path: CString): sqlite3;

/** @statorExtern sqlite3_version */
declare function extLinkedVersion(db: sqlite3): number;
