// `std/process` (docs/STD.md §5): identity, arguments, clock, memory and the exit status, then
// `exit`, which ends the program at once — the line after it never prints, on either side.
// Machine-dependent answers print as facts both sides share (an absolute path that exists, a
// positive integer), never as the values. A non-integer or out-of-range status is refused before
// anything changes. A non-zero status, `abort` and real arguments cannot be a golden (the runner
// demands exit 0 and passes none); unit/std.test.ts proves those against the built binary.
import { exists } from "std/fs";
import { arch as osArch, platform as osPlatform } from "std/os";
import { isAbsolute } from "std/path";
import {
  arch,
  argv,
  execPath,
  exit,
  exitCode,
  hrtimeNs,
  memoryUsage,
  pid,
  platform,
  ppid,
  setExitCode,
} from "std/process";

const id = pid();
console.log(id === Math.floor(id), id > 0, id === pid());

const parent = ppid();
console.log(parent === Math.floor(parent), parent > 0, parent !== id);

// argv()[0] is the program itself (Node's twin drops the `node` binary in front of the script).
const args = argv();
console.log(args.length, args.slice(1));

const exe = execPath();
console.log(isAbsolute(exe), exists(exe));

console.log(platform() === osPlatform(), arch() === osArch());

const t0 = hrtimeNs();
const t1 = hrtimeNs();
console.log(t0 > 0, t1 >= t0, t0 === Math.floor(t0));

const rss = memoryUsage().rss;
console.log(rss === Math.floor(rss), rss > 1024 * 1024);

console.log(exitCode());
for (const code of [-1, 256, 1.5, NaN]) {
  try {
    setExitCode(code);
  } catch (e) {
    if (e instanceof Error) {
      console.log(e.message);
    }
  }
}
setExitCode(0);
console.log(exitCode());

for (const code of [-1, 256, 1.5, NaN]) {
  try {
    exit(code);
  } catch (e) {
    if (e instanceof Error) {
      console.log(e.message);
    }
  }
}

console.log("before exit");
exit(0);
console.log("after exit");
