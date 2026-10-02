// `std/path` (docs/STD.md §5): POSIX path strings, pure TypeScript with no native backing. The
// oracle runs the same packages/std/src/path.ts under Node (golden/std-oracle.ts), so this pins
// that Stator compiles the module's string walking exactly as Node runs it; the expected
// answers themselves are the POSIX basename(3)/dirname(3) ones the module documents.
import { basename, dirname, isAbsolute, join } from "std/path";

const samples = ["/a/b/c.txt", "/a/b/", "/", "", "a.txt", "a//b", "//", "./x/../y"];
for (const p of samples) {
  console.log(JSON.stringify(p), isAbsolute(p), JSON.stringify(basename(p)), JSON.stringify(dirname(p)));
}
console.log(join("/a/b", "c"));
console.log(join("/a/b/", "/c"));
console.log(join("a//", "//b"));
console.log(join("", "b"));
console.log(join("a", ""));
