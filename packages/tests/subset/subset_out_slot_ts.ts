// @mode: ts
// @verdict: static
// SUBSET.md: FFI — Out<T> out-slot happy path (docs/FFI.md section 2: T** spelled as Out<T>).
// A slot from outSlot<Db>() passes to an Out<Db> parameter and reads back through .value;
// the call writes through the pointer, so the read is a fresh value.
/// <reference path="./helper_extern_out.d.ts" />

const s = outSlot<Db>();
const rc = fakeOpen("test.db" as CString, s);
console.log(rc, s.value);
export {};
