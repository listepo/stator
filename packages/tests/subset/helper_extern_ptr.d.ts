// Shared declaration for the subset_extern_ptr_* decision fixtures (docs/FFI.md section 2):
// a branded pointer — a TABLE type whose lowering is not in steps 4–5. The pointer needs a
// runtime representation and a per-signature ownership rule (step 6), so the gate defers it
// as STA1217 rather than refusing a shape the table promises.

/** An opaque handle owned by the C library, never dereferenced by generated code. */
type sqlite3 = { readonly __brand: "sqlite3" };

/** @statorExtern */
declare function extDbVersion(db: sqlite3): number;
