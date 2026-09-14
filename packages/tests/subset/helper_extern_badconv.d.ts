// Shared declaration for the subset_extern_badconv_* decision fixtures (docs/FFI.md
// section 4): a misspelled `@statorError` convention. The vocabulary is closed, so a binding
// that invents its own is a gate error at the declaration, never a silent default.

/** @statorExtern @statorError non-zero */
declare function extTypo(x: number): number;
