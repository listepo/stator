// @mode: ts
// @verdict: static
// SUBSET.md: FFI — `errno` on a void return (docs/FFI.md section 4): the matrix exception.
// `errno` is read from the thread-local after the call, not from the return value, so the
// matrix (`externConventionMismatch`, packages/compiler/src/hir/nodes.ts) clears it on every
// return kind including `void`, and the call stays static.
/// <reference path="./helper_extern_errmat_errno_void.d.ts" />

extErrmatErrnoVoid(4);
export {};
