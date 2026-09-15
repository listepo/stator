// Shared declarations for the subset_out_* decision fixtures (docs/FFI.md §2): the
// `Out<T>` out-slot spelling for `T**` parameters (v0.1). Slots are created by the
// blessed `outSlot<T>()` (recognized by name + ambient declaration, never by import),
// passed to `Out<T>` parameters, and read through `.value`; everything else is STA1125.
// The fake callee needs no C file: decision fixtures never link.

// Borrowed NUL-terminated UTF-8 at the FFI boundary (docs/FFI.md §3).
type CString = string & { readonly __statorCstr: "CString" };

/** An opaque handle owned by the C library, never dereferenced by generated code. */
type Db = { readonly __brand: "db" };

/** An out-slot spelling for `T**` (docs/FFI.md §2, v0.1): the callee writes the `T*`
 * through it, the caller reads `.value`. Slots live in locals, pass to `Out<T>`
 * parameters, and read through `.value`. */
type Out<T> = { readonly value: T };

/** The blessed slot constructor: answers the pure zero-handle, recognized by this exact
 * ambient declaration (docs/FFI.md §2). A real implementation under this name is the
 * user's own function, never the builtin. */
declare function outSlot<T>(): Out<T>;

/** @statorExtern fake_open */
declare function fakeOpen(name: CString, db: Out<Db>): number;

/** @statorExtern db_version */
declare function dbVersion(db: Db): number;
