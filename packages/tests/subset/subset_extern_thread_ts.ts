// @mode: ts
// @verdict: static
// SUBSET.md: FFI — branded-pointer handle bound once and threaded through TWO calls
// (docs/FFI.md section 2 `T*` row). Borrow-only pass-through landed: a handle from one call
// crosses into another untouched as void*, so reusing one binding across two calls is static —
// the per-signature ownership rule covers aliasing because no position retains the handle.
/// <reference path="./helper_extern_ptr.d.ts" />

const h: sqlite3 = { __brand: "sqlite3" } as sqlite3;
console.log(extDbVersion(h));
console.log(extDbVersion(h));
export {};
