// `std/path` — POSIX path walking (docs/STD.md §5 `std/path` row, T10.1 step 2).
//
// First-party module: the declarations live in `path.d.ts` (fixture-local C shims in
// `path.c`), and this file is the thin typed wrapper users import. Pure string walking —
// no filesystem access — so the golden is fully deterministic. Edge semantics follow
// POSIX: a leading `/` is absolute; `.` segments drop; `..` pops (past root stays root);
// empty segments collapse; a trailing slash survives only on the root. `join` takes
// exactly two segments here — the variadic form is a later slice, refused by arity.

/// <reference path="./path.d.ts" />

export function isAbsolute(path: string): boolean {
  // The shim answers `double` 1/0 (a `bool` return would need `<stdbool.h>` in the
  // emitted prologue, which only library builds include — codegen `emitMain`); compare
  // against 1 here, where the compiler owns the type.
  return stdPathIsAbsolute(path as CString) === 1;
}

export function basename(path: string): string {
  return stdPathBasename(path as CString);
}

export function dirname(path: string): string {
  return stdPathDirname(path as CString);
}

export function join(a: string, b: string): string {
  return stdPathJoinTwo(a as CString, b as CString);
}
