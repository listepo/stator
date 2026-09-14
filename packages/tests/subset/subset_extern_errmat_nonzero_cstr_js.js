// @mode: js
// @verdict: error
// @code: STA1119
// SUBSET.md: FFI — `nonzero` on a `CString` return (docs/FFI.md section 4), called from
// untyped code. The mismatch is in the declaration, so both modes agree on STA1119
// (`externConventionMismatch`, packages/compiler/src/hir/nodes.ts).
/// <reference path="./helper_extern_errmat_nonzero_cstr.d.ts" />

console.log(extErrmatNonzeroCstr(1));
