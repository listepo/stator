// Shared declaration for the subset_extern_errmat_null_number_* decision fixtures
// (docs/FFI.md section 4): a `null` convention on a number return. The convention guards a
// pointer return, and a C `double` is not one — `externConventionMismatch`
// (packages/compiler/src/hir/nodes.ts) accepts `null` only on a `cstring` return, so the
// gate reports STA1119.

/** @statorExtern @statorError null */
declare function extErrmatNullNumber(x: number): number;
