// Shared declaration for the subset_extern_errmat_badconv_* decision fixtures (docs/FFI.md
// section 4): a misspelled `@statorError` convention. The vocabulary is closed (`nonzero`,
// `negative`, `null`, `errno`); `nonzeroe` is not a member, so the gate reports STA1119 at
// the declaration instead of silently reading it as "no convention".

/** @statorExtern @statorError nonzeroe */
declare function extErrmatBadconv(x: number): number;
