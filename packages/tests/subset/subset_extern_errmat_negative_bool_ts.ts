// @mode: ts
// @verdict: error
// @code: STA1119
// SUBSET.md: FFI — `negative` on a boolean return (docs/FFI.md section 4). The convention
// reads a numeric return as an error code and a C `bool` carries none, so the matrix
// (`externConventionMismatch`, packages/compiler/src/hir/nodes.ts) refuses the combination.
/// <reference path="./helper_extern_errmat_negative_bool.d.ts" />

console.log(extErrmatNegativeBool(1));
export {};
