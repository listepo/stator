// @mode: ts
// @verdict: error
// @code: STA1119
// SUBSET.md: FFI — `null` on a number return (docs/FFI.md section 4). The convention guards
// a pointer return and a C `double` is not one — the matrix (`externConventionMismatch`,
// packages/compiler/src/hir/nodes.ts) accepts `null` only on a `cstring` return.
/// <reference path="./helper_extern_errmat_null_number.d.ts" />

console.log(extErrmatNullNumber(1));
export {};
