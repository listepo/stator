// @mode: ts
// @verdict: error
// @code: STA1119
// SUBSET.md: FFI — `null` on a boolean return (docs/FFI.md section 4). The convention guards
// a pointer return and a C `bool` is not one — the matrix (`externConventionMismatch`,
// packages/compiler/src/hir/nodes.ts) accepts `null` only on a `cstring` return.
/// <reference path="./helper_extern_errmat_null_bool.d.ts" />

console.log(extErrmatNullBool(1));
export {};
