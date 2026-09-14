// @mode: ts
// @verdict: static
// SUBSET.md: FFI — extern calls over the covered set (docs/FFI.md section 2): scalars,
// CString transfer, boolean and void returns. Each lowers to a direct C call with no
// `jsrt_value` on the way out (plan.md section 10 Task 7.1 step 5).
/// <reference path="./helper_extern_direct.d.ts" />

console.log(extSqrt(4));
console.log(extFmod(5.5, 2));
console.log(extIsPositive(1));
extSeed(7);
extFree("bye" as CStringOwned);
export {};
