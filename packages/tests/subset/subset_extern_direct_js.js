// @mode: js
// @verdict: static
// SUBSET.md: FFI — extern calls with statically-typed arguments (docs/FFI.md section 5:
// static + unchecked-boundary flag). A literal is typed even in untyped code, so no boundary
// check is owed and the file stays static.
/// <reference path="./helper_extern_direct.d.ts" />

console.log(extSqrt(4));
console.log(extFmod(5.5, 2));
console.log(extIsPositive(1));
extSeed(7);
extFree("bye");
