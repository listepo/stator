// Shared declarations for the subset_extern_libc_* decision fixtures (docs/FFI.md sections
// 1–4): the libc `strstr` binding whose call sites the fixtures pin as `static`. The TRUE C
// signature `char *strstr(const char *, const char *)` matches the ABI table exactly — two
// CString borrows in, one CString copy-out — so the gate accepts both the plain and the
// `@statorError null` spellings (`null` allows only a CString return, which this is). The C
// symbol never needs to exist: decision fixtures run `explain`, never a link.

/** Borrowed NUL-terminated UTF-8 at the FFI boundary (docs/FFI.md section 3). */
type CString = string & { readonly __statorCstr: "CString" };

/** @statorExtern strstr */
declare function strstr2(haystack: CString, needle: CString): CString;

/** @statorExtern strstr @statorError null */
declare function strstrChecked(haystack: CString, needle: CString): CString;
