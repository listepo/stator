// @mode: ts
// @verdict: static
// SUBSET.md: FFI — `nonzero` on a number return (docs/FFI.md section 4): the control case.
// This is the one value-signalling combination the matrix accepts (`externConventionMismatch`,
// packages/compiler/src/hir/nodes.ts clears `nonzero`/`negative` exactly on `number`), so the
// convention changes what the call checks, not the verdict: still static.
// (docs/FFI.md section 5).
/// <reference path="./helper_extern_errmat_nonzero_number.d.ts" />

console.log(extErrmatNonzeroNumber(0));
export {};
