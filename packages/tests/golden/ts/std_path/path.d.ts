// `std/path` binding declarations (docs/STD.md §5 `std/path` row, T10.1 step 2):
// pure-C string walking behind the extern surface. The C symbols are tiny first-party
// shims in the fixture's own `path.c`, compiled and linked by the golden harness
// beside the entry (fixture-build `compileFixtureC`, the extern_ptr `ffi.c` precedent —
// zero declaration-file involvement). `std`-shaped TS names, C names under the override.
// Bare `string` never crosses (docs/FFI.md §2: STA1118) — every string position is the
// `CString` borrow, converted with `as CString` at the wrapper.

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
