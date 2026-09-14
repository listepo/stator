// @mode: js
// @verdict: error
// @code: STA1115
// @expected-fail: true
// SUBSET.md: FFI — object type in an extern signature (docs/FFI.md section 2). The declaration
// (/** @statorExtern */ declare function cTakeObject(o: { x: number }): number;) lands in
// helper_extern_ffi.d.ts with Task 7.1 step 10; until then the reference below dangles.
/// <reference path="./helper_extern_ffi.d.ts" />

console.log(cTakeObject({ x: 1 }));
