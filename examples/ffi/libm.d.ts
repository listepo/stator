// libm.d.ts — manual binding for libm, scalar-only shape (plan.md §10 Task 7.3 step 1).
//
// Shape covered: plain path — `number` in, `number` out, no allocation, no
// lifetime, no error convention. Proves the ABI table's unmarked case
// (docs/FFI.md §2: `number` <-> `double`, no conversion).
//
// Build: links against libm (`-lm` on hosts that need it; no separate install
// required). There is no link-pragma spelling yet — Task 7.1 step 7
// (link plumbing) is unstarted, so the link requirement is prose here, not a
// pragma. See NOTES.md ("no link pragma").
//
// Every declaration carries the per-declaration marker (docs/FFI.md §1). The C
// symbol defaults to the TS name; the tag's trailing text overrides it where
// the C name is not a valid or idiomatic TS identifier.

// Borrowed NUL-terminated UTF-8 at the FFI boundary (docs/FFI.md §3).
// Unused in this binding (libm takes no strings); repeated here so the file
// is a drop-in without cross-file references.
type CString = string & { readonly __statorCstr: "CString" };

/** @statorExtern sqrt */
declare function libmSqrt(x: number): number;

/** @statorExtern fmod */
declare function libmFmod(x: number, y: number): number;

/** @statorExtern pow */
declare function libmPow(x: number, y: number): number;

/** @statorExtern fabs */
declare function libmFabs(x: number): number;

/** @statorExtern floor */
declare function libmFloor(x: number): number;

// Ownership: none. All parameters are `number` (C `double`, unboxed copies);
// all returns are `number`. Nothing is allocated, borrowed, or transferred.
// Error convention: none (absent tag — the return is a value, never an
// exception). Domain errors surface as NaN/huge values per the C library,
// exactly as Node's Math.* does for the same inputs; see NOTES.md
// ("math domain errors").
