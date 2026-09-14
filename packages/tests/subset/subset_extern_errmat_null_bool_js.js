// @mode: js
// @verdict: error
// @code: STA1119
// SUBSET.md: FFI — `null` on a boolean return (docs/FFI.md section 4), called from untyped
// code. The mismatch is in the declaration, so both modes agree on STA1119
// (`externConventionMismatch`, packages/compiler/src/hir/nodes.ts).
/// <reference path="./helper_extern_errmat_null_bool.d.ts" />

console.log(extErrmatNullBool(1));
