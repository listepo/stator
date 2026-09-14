// Shared declaration for the subset_extern_errmat_errno_void_* decision fixtures
// (docs/FFI.md section 4): an `errno` convention on a void return — the matrix exception the
// fixtures prove. `errno` is read from the thread-local after the call, not from the return
// value, so `externConventionMismatch` (packages/compiler/src/hir/nodes.ts) accepts it on
// every return kind including `void`, and the gate accepts this declaration.

/** @statorExtern @statorError errno */
declare function extErrmatErrnoVoid(x: number): void;
