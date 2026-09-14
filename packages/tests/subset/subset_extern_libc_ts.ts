// @mode: ts
// @verdict: static
// SUBSET.md: FFI — libc `strstr` through the extern surface (docs/FFI.md sections 2–3):
// two CString borrows in, one CString copy-out. The TRUE C signature matches the ABI table
// exactly, so the gate accepts the declaration (frontend/extern.ts classifyExternDeclaration
// maps both positions to `cstring`) and each direct call lowers to a plain C call —
// including the `@statorError null` spelling, which `null` allows only on a CString return.
/// <reference path="./helper_extern_libc.d.ts" />

console.log(strstr2("hello world" as CString, "world" as CString));
console.log(strstrChecked("hello world" as CString, "world" as CString));
export {};
