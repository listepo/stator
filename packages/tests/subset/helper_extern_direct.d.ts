// Shared declarations for the subset_extern_direct_*, subset_extern_error_*,
// subset_extern_value_* and subset_extern_arity_* decision fixtures (docs/FFI.md sections
// 1–2, 4): valid extern signatures over the covered set — scalars, CString borrow and
// transfer, and the opted-in error conventions. Only declarations the gate ACCEPTS live here;
// every refusal kind gets its own helper, because the declaration walk reports every bad
// signature in the file. The C symbols never need to exist: decision fixtures run `explain`,
// never a link.

/** Borrowed NUL-terminated UTF-8 at the FFI boundary (docs/FFI.md section 3). */
type CString = string & { readonly __statorCstr: "CString" };

/** Transferred copy: the callee owns it after return (docs/FFI.md section 3). */
type CStringOwned = string & { readonly __statorCstrOwned: "CStringOwned" };

/** @statorExtern */
declare function extSqrt(x: number): number;

/** @statorExtern fmod */
declare function extFmod(x: number, y: number): number;

/** @statorExtern */
declare function extIsPositive(x: number): boolean;

/** @statorExtern */
declare function extSeed(x: number): void;

/** @statorExtern */
declare function extFree(p: CStringOwned): void;

/** @statorExtern @statorError nonzero */
declare function extChecked(x: number): number;

/** @statorExtern @statorError errno */
declare function extErrno(x: number): number;
