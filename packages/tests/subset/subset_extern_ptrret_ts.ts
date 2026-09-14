// @mode: ts
// @verdict: static
// SUBSET.md: FFI — branded-pointer RETURN (docs/FFI.md section 2 `T*` row). The declaration
// lives in the shared helper (a `.d.ts`, so the gate reads the marker where it is written);
// the return crosses as void* and the CString argument borrows, so the call is a direct C
// call — static, with the unchecked-boundary flag alongside.
/// <reference path="./helper_extern_ptrret.d.ts" />

console.log(extOpenDb("app.db" as CString));
export {};
