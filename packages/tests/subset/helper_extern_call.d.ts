// Shared declarations for the subset_extern_call_ts decision fixture (docs/FFI.md
// sections 1-2): the extern-call happy path over ABI scalar types. Kept apart from
// helper_extern_ffi.d.ts, whose refusal rows would otherwise taint the verdict:
// one file, one verdict family (cf. helper_extern_ptrret.d.ts). The C symbol never
// needs to exist: decision fixtures run `explain`, never a link.

/** @statorExtern */
declare function cAdd(a: number, b: number): number;
