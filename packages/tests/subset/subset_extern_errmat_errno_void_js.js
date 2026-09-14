// @mode: js
// @verdict: static
// SUBSET.md: FFI — `errno` on a void return (docs/FFI.md section 4), called from untyped
// code with a statically-typed literal argument, so static + unchecked-boundary flag
// (docs/FFI.md section 5). The matrix exception: `errno` fits `void` where every
// value-signalling convention is STA1119.
// (`externConventionMismatch`, packages/compiler/src/hir/nodes.ts).
/// <reference path="./helper_extern_errmat_errno_void.d.ts" />

extErrmatErrnoVoid(4);
