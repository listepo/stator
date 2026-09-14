// @mode: ts
// @verdict: error
// @code: STA1119
// SUBSET.md: FFI — `nonzero` on a `CString` return (docs/FFI.md section 4). The convention
// reads a numeric return as an error code and a `const char*` carries none, so the matrix
// (`externConventionMismatch`, packages/compiler/src/hir/nodes.ts) refuses the combination.
/// <reference path="./helper_extern_errmat_nonzero_cstr.d.ts" />

console.log(extErrmatNonzeroCstr(1));
export {};
