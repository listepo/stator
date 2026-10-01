// Shared declarations for the subset_std_path_* decision fixtures (docs/STD.md §5,
// T10.1 step 2): the `std/path` surface — pure-C POSIX string walking. The C shims
// live in the golden's `path.c` for the GOLDEN proof; these declarations describe the
// same signatures for the DECISION proof (the gate never links). One declaration file,
// one verdict family: every signature here is accepted (the helper_extern_direct.d.ts
// rule). Bare `string` never crosses (docs/FFI.md §2: STA1118) — the `CString` borrow.

/** Borrowed NUL-terminated UTF-8 at the FFI boundary (docs/FFI.md section 3). */
type CString = string & { readonly __statorCstr: "CString" };

/** @statorExtern std_path_is_absolute */
declare function stdPathIsAbsolute(path: CString): number;

/** @statorExtern std_path_basename */
declare function stdPathBasename(path: CString): CString;

/** @statorExtern std_path_dirname */
declare function stdPathDirname(path: CString): CString;

/** @statorExtern std_path_join_two */
declare function stdPathJoinTwo(a: CString, b: CString): CString;
