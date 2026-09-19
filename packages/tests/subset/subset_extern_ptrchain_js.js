// @mode: js
// @verdict: static
// SUBSET.md: FFI — branded-pointer chain from untyped code (docs/FFI.md section 2 `T*`
// row): open returns the handle, query and close each consume it. The triple lives
// whole in helper_extern_chain.d.ts — the shared per-kind helper (one file, one
// verdict family) — where the gate reads each marker where it is written, so the
// shared-helper STA1114 walk is gone and the chain compiles borrow-only: each handle
// crosses as void* in its frame slot, untouched and unretained.
/// <reference path="./helper_extern_chain.d.ts" />

const h = extOpenDb("app.db");
console.log(extQuery(h));
extClose(h);
