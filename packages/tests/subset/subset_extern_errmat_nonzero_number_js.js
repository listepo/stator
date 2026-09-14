// @mode: js
// @verdict: static
// SUBSET.md: FFI — `nonzero` on a number return (docs/FFI.md section 4): the control case,
// statically-typed literal argument, so static + unchecked-boundary flag (docs/FFI.md
// section 5). The matrix accepts `nonzero` exactly on `number`
// (`externConventionMismatch`, packages/compiler/src/hir/nodes.ts).
/// <reference path="./helper_extern_errmat_nonzero_number.d.ts" />

console.log(extErrmatNonzeroNumber(0));
