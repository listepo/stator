// Shared declaration for the subset_extern_errmat_nonzero_cstr_* decision fixtures
// (docs/FFI.md section 4): a `nonzero` convention on a `CString` return. The convention reads
// a numeric return as an error code, and a `const char*` carries none —
// `externConventionMismatch` (packages/compiler/src/hir/nodes.ts) refuses every non-number
// return for `nonzero`/`negative`, so the gate reports STA1119.

/** Borrowed NUL-terminated UTF-8 at the FFI boundary (docs/FFI.md section 3). */
type CString = string & { readonly __statorCstr: "CString" };

/** @statorExtern @statorError nonzero */
declare function extErrmatNonzeroCstr(x: number): CString;
