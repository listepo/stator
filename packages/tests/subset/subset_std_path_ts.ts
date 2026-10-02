// @mode: ts
// @verdict: static
// SUBSET.md: std/* imports — `std/path` is pure TypeScript with no native backing
// (docs/STD.md §5); proved byte-for-byte by the `std_path` golden.
import { basename, dirname, join } from "std/path";

console.log(basename("/a/b.txt"), dirname("/a/b.txt"), join("/a", "b"));
