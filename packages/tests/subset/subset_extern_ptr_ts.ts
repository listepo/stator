// @mode: ts
// @verdict: not-yet
// @code: STA1217
// SUBSET.md: FFI — branded pointer in an extern signature (docs/FFI.md section 2 `T*` row).
// The table promises the shape, but steps 4–5 build no representation for it: the lifetime
// belongs to the C library, so the call waits on step 6's per-signature ownership, and the
// verdict stays not-yet rather than inventing a box.
/// <reference path="./helper_extern_ptr.d.ts" />

console.log(extDbVersion({ __brand: "sqlite3" } as sqlite3));
export {};
