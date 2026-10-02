// `std/os` (docs/STD.md §5): the machine and the user's account, each answer compared with the
// pinned Node's `node:os` on the same machine. The environment rules for `homedir` and `tmpdir`
// are driven through `std/env`, which changes the real environment both sides read.
import { has, get, set, unset } from "std/env";
import { arch, cpuCount, eol, homedir, hostname, platform, release, tmpdir, totalMemory } from "std/os";

console.log(platform(), arch(), release());
console.log(hostname());
console.log(cpuCount(), cpuCount() >= 1, totalMemory() > 0, totalMemory() === Math.floor(totalMemory()));
console.log(JSON.stringify(eol));

const savedHome = has("HOME") ? get("HOME") : undefined;
console.log(homedir() === (savedHome ?? homedir()));
set("HOME", "/home/stator");
console.log(homedir());
set("HOME", "");
console.log(JSON.stringify(homedir()));
if (savedHome === undefined) {
  unset("HOME");
} else {
  set("HOME", savedHome);
}

for (const name of ["TMPDIR", "TMP", "TEMP"]) {
  unset(name);
}
console.log(tmpdir());
set("TEMP", "/c/");
console.log(tmpdir());
set("TMP", "/b");
console.log(tmpdir());
set("TMPDIR", "");
console.log(tmpdir());
set("TMPDIR", "/a//");
console.log(tmpdir());
set("TMPDIR", "/");
console.log(tmpdir());
