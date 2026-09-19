// @mode: ts
// @verdict: static
// SUBSET.md: std/path — pure-C POSIX string walking (docs/STD.md §5, T10.1 step 2).
// The declarations live beside this fixture (`helper_std_path.d.ts`); the C shims
// live in the `std_path` golden's `path.c` for the LINK proof. `static` + the
// unchecked-boundary flag (docs/FFI.md §5), proved byte-for-byte by that golden.
/// <reference path="./helper_std_path.d.ts" />

console.log(stdPathIsAbsolute("/a" as CString));
console.log(stdPathBasename("/a/b" as CString));
console.log(stdPathDirname("/a/b" as CString));
console.log(stdPathJoinTwo("/a" as CString, "b" as CString));
export {};
