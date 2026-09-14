// Shared declaration for the subset_extern_errmat_nonzero_number_* decision fixtures
// (docs/FFI.md section 4): a `nonzero` convention on a number return — the control case. This
// is the one value-signalling combination the matrix accepts (`externConventionMismatch` in
// packages/compiler/src/hir/nodes.ts clears `nonzero`/`negative` exactly on `number`), so
// the gate accepts this declaration and the call pins static.

/** @statorExtern @statorError nonzero */
declare function extErrmatNonzeroNumber(x: number): number;
