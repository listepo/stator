// Shared declarations for the subset_extern_ptr_* and subset_extern_borrow_* decision
// fixtures (docs/FFI.md section 2): a branded pointer in borrow-only pass-through (step 6).
// Handles arrive from calls and cross untouched as void*; the gate trusts the declared
// signature the way it trusts any annotation at the FFI boundary (docs/FFI.md section 5).

/** An opaque handle owned by the C library, never dereferenced by generated code. */
type sqlite3 = { readonly __brand: "sqlite3" };

/** @statorExtern db_open */
declare function extOpenDb(seed: number): sqlite3;

/** @statorExtern db_open @statorError null */
declare function extOpenMaybe(seed: number): sqlite3;

/** @statorExtern */
declare function extDbVersion(db: sqlite3): number;

/** @statorExtern db_close */
declare function extCloseDb(db: sqlite3): void;
