// Shared declarations for the subset_extern_unknown_ts decision fixture (docs/FFI.md
// section 2): `unknown` in an extern signature — it would need boxing, so it is refused
// as STA1114 rather than silently boxed. Kept apart from the accepted helpers (whose
// only-accepted rule the refusal would violate) and from helper_extern_ffi.d.ts: one
// file, one verdict family (cf. helper_extern_ptrret.d.ts). The C symbol never needs to
// exist: decision fixtures run `explain`, never a link.

/** @statorExtern */
declare function cTakeUnknown(x: unknown): number;
