// `std/*` from js mode (docs/STD.md §1): the same library under both modes — an untyped caller
// imports the typed std modules, and every value it hands them crosses the boundary check the
// typed signatures imply.
import { get, set, unset } from "std/env";
import { basename, dirname, join } from "std/path";
import { nowMs } from "std/time";

const parts = ["/usr/local/bin/", "file.txt", "/", ""];
for (const p of parts) {
  console.log(basename(p), dirname(p));
}
console.log(join(dirname("/a/b/c"), basename("/x/y")));

set("STATOR_STD_JS_SCRATCH", "js-mode");
console.log(get("STATOR_STD_JS_SCRATCH"));
unset("STATOR_STD_JS_SCRATCH");
console.log(get("STATOR_STD_JS_SCRATCH"));
console.log(typeof nowMs(), nowMs() > 0);
try {
  set("", "x");
} catch (e) {
  console.log(e instanceof Error, e.message);
}
