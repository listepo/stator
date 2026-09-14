// @mode: js
// @verdict: static
// @expected-fail: true
// SUBSET.md: FFI — overloaded extern resolves to the first marked declaration, and the call
// matches it, so the file is static. The declarations (/** @statorExtern */ declare function
// cPick(x: number): number; /** @statorExtern */ declare function cPick(x: string): number;
// — the second wearing a bare `string`, never classified) land in helper_extern_ffi.d.ts
// with Task 7.1 step 10; until then the reference below dangles.
/// <reference path="./helper_extern_ffi.d.ts" />

console.log(cPick(1));
