// Shared declaration for the subset_extern_convmismatch_* decision fixtures (docs/FFI.md
// section 4): a `nonzero` convention on a boolean return. The convention reads the return
// VALUE as an error code, and a C `bool` carries none — the declaration contradicts itself,
// so the gate refuses it rather than emitting a check that cannot mean anything.

/** @statorExtern @statorError nonzero */
declare function extFlag(x: number): boolean;
