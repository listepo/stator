// @mode: ts
// @verdict: static
// SUBSET.md: FFI — unannotated alias of an Out<T> slot (docs/FFI.md section 2: `const t = s`
// keeps the slot in locals with its type inferred, so passing the alias as an out-param and
// reading .value through it is the happy path, not an escape).
/// <reference path="./helper_extern_out.d.ts" />

const s = outSlot<Db>();
const t = s;
const rc = fakeOpen("test.db" as CString, t);
console.log(rc, t.value);
export {};
