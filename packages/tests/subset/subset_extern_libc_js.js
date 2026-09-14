// @mode: js
// @verdict: static
// SUBSET.md: FFI — libc `strstr` from untyped code (docs/FFI.md section 5: static +
// unchecked-boundary flag). Literals are typed even in untyped code, so no boundary check
// is owed and the file stays static; the declaration lives in helper_extern_libc.d.ts.
/// <reference path="./helper_extern_libc.d.ts" />

console.log(strstr2("hello world", "world"));
console.log(strstrChecked("hello world", "world"));
