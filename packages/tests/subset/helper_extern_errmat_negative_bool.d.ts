// Shared declaration for the subset_extern_errmat_negative_bool_* decision fixtures
// (docs/FFI.md section 4): a `negative` convention on a boolean return. The convention reads
// a numeric return as an error code, and a C `bool` carries none — `externConventionMismatch`
// (packages/compiler/src/hir/nodes.ts) refuses every non-number return for
// `nonzero`/`negative`, so the gate reports STA1119.

/** @statorExtern @statorError negative */
declare function extErrmatNegativeBool(x: number): boolean;
