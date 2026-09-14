// stat.d.ts — manual binding for POSIX `stat(2)`, struct-by-pointer shape
// (plan.md §10 Task 7.3 step 1).
//
// Shape covered: the ONE aggregate shape v0 supports — a struct passed BY
// POINTER, never by value, never inspected by generated code. Proves field
// offsets are load-bearing and must come from the platform, not the binding.
//
// VERIFIED against headers: the signature `stat(const char *,
// struct stat *)` exists in the Xcode SDK `sys/stat.h:387`
// (`__DARWIN_INODE64(stat)`). The `struct stat` LAYOUT was deliberately not
// copied: on this platform it is `__DARWIN_STRUCT_STAT64` (conditionally
// compiled, 64-bit inode variant), so any offsets written here would be a
// guess on the next platform. See NOTES.md ("stat offsets").
//
// Build: libc, no extra link flag. No link-pragma spelling exists yet
// (Task 7.1 step 7 unstarted) — see NOTES.md ("no link pragma").

// Borrowed NUL-terminated UTF-8 at the FFI boundary (docs/FFI.md §3).
type CString = string & { readonly __statorCstr: "CString" };

/** Opaque `struct stat` buffer (`struct stat*`). The caller allocates the
 *  storage; the callee fills it. Generated code never dereferences it and
 *  the binding declares NO field accessors — field offsets are platform ABI
 *  (see header note above) and v0 has no offset mechanism. What a generator
 *  would need to emit real field access is recorded in NOTES.md
 *  ("stat offsets"). Lifetime: stack/frame-owned on the TS side for the
 *  duration of the call; the callee retains nothing. */
type StatBuf = { readonly __brand: "stat_buf" };

// Ownership: `path` is a `CString` borrow (freed after return; the callee
// retains nothing). `buf` is borrowed for the call; filled, not retained.
// Error convention: `@statorError negative` — `stat` returns 0 on success,
// -1 on failure. The failure DETAIL lives in `errno`, which this single tag
// does not read; combining "negative return" with "errno carries it" has no
// spelling (see NOTES.md "error composition"). The thrown Error names the
// function and the failed convention (docs/FFI.md §4); it cannot name the
// errno value until the conventions compose.

/** @statorExtern stat @statorError negative */
declare function posixStat(path: CString, buf: StatBuf): number;

// ============================================================================
// REFUSED / NOT DECLARED (v0 scope; recorded, not approximated).
// ============================================================================
//
// 1. `struct stat` BY VALUE (as parameter or return): STA1119 (docs/FFI.md §2
//    — ABI layout per platform is a task of its own).
// 2. Field accessors (`st_size`, `st_mode`, …): NOT DECLARED. Reading a field
//    needs that field's byte offset and width for the target platform, and
//    guessing them is a silent-ABI-mismatch bug, not a binding. Opaque-pointer
//    style is the whole declaration until the generator can emit `offsetof`-
//    derived access (see NOTES.md "stat offsets").
// 3. `S_ISDIR` / `S_ISREG` / permission-bit macros (`sys/stat.h`): macro
//    constants and bitfield-style tests are out of scope (Task 7.3 step 5) —
//    same gap as the SQLITE_* macros in sqlite3.d.ts.
// 4. `fstat` / `lstat` differ only in the first parameter type (fd vs path)
//    and are expressible in v0, but are omitted: without field accessors a
//    second spelling of the same unusable buffer proves nothing new.
