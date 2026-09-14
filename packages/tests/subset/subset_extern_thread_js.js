// @mode: js
// @verdict: static
// SUBSET.md: FFI — branded-pointer handle bound once and threaded through two calls, from
// untyped code (docs/FFI.md section 2 `T*` row). Borrow-only pass-through landed in both modes:
// the handle crosses untouched, so the threaded shape is static like its ts twin.
/// <reference path="./helper_extern_ptr.d.ts" />

const h = { __brand: "sqlite3" };
console.log(extDbVersion(h));
console.log(extDbVersion(h));
