// `std/path` end to end (docs/STD.md §5 `std/path` row, T10.1 step 2): pure POSIX
// string walking — no filesystem access, so fully deterministic. The entry calls the
// fixture-C shims DIRECTLY (the extern_ptr/main.ts shape: ambient `declare` externs at
// top level, no wrapper module between the entry and the `declare`), so the Node oracle
// runs this same file with `node_shim.mjs` DEFINING the globals. The `std`-shaped
// wrappers live in `path.ts` as the importable surface; the golden proves the SHIMS,
// and the wrappers are one-line forwards the subset fixtures pin.
/// <reference path="./path.d.ts" />

type CString = string & { readonly __statorCstr: "CString" };

console.log(stdPathIsAbsolute("/a/b" as CString));
console.log(stdPathIsAbsolute("a/b" as CString));
console.log(stdPathBasename("/a/b/c.txt" as CString));
console.log(stdPathBasename("/a/b/" as CString));
console.log(stdPathBasename("/" as CString));
console.log(stdPathDirname("/a/b/c.txt" as CString));
console.log(stdPathDirname("a.txt" as CString));
console.log(stdPathDirname("/" as CString));
console.log(stdPathJoinTwo("/a/b" as CString, "c" as CString));
console.log(stdPathJoinTwo("/a/b/" as CString, "/c" as CString));
export {};
