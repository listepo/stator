// Extern declarations for the extern_strstr golden (docs/FFI.md): the libc `strstr`
// whose TRUE C signature matches the ABI mapping exactly — `char *f(const char *,
// const char *)`, the two-CString-in, one-CString-out shape (docs/FFI.md sections 2–3).
// The emitted forward declaration is `char *strstr(const char *, const char *)`, identical
// to string.h (parameter names irrelevant), so the build stays warning-free under
// -Wall -Wextra -Werror with zero link flags (pure libc).
//
// What is NOT spelled here, and why: no int-returning libc function (strlen, strcmp,
// strncmp, memcmp) — until an `i32` refinement lands every `number` maps to `double`
// (docs/FFI.md section 2, docs/NUMERIC.md), and calling an int-returning function through
// a double prototype is undefined behavior with garbage results. No `strdup` — a malloc'd
// return the runtime never frees is an ASan/LSan leak by construction (docs/FFI.md
// section 3: only an explicit free function in the same binding may own such memory).
// No `strncpy` (a caller-owned buffer has no spelling) or `strtok` (retained static state
// has no spelling).

/** Borrowed NUL-terminated UTF-8 at the FFI boundary (docs/FFI.md section 3). */
type CString = string & { readonly __statorCstr: "CString" };

/** @statorExtern strstr */
declare function strstr2(haystack: CString, needle: CString): CString;

/** @statorExtern strstr @statorError null */
declare function strstrChecked(haystack: CString, needle: CString): CString;
