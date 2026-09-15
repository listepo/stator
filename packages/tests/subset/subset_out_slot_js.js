// @mode: js
// @verdict: static
// SUBSET.md: FFI — Out<T> out-slot happy path from untyped code (docs/FFI.md section 2).
// Declarations ride the shared helper (the free static path, MODES.md); the call writes
// through the pointer, .value reads back.
/// <reference path="./helper_extern_out.d.ts" />

/** @type {Out<Db>} */
const s = outSlot();
fakeOpen(/** @type {CString} */ ("test.db"), s);
console.log(s.value);
