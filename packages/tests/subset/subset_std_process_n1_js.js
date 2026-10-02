// @mode: js
// @verdict: static
// SUBSET.md: std/* imports — `std/process`'s T11.3 members (docs/STD.md §5); proved by the
// `std_process` golden and unit/std.test.ts (arguments, exit status).
import { argv, execPath, exitCode, hrtimeNs, memoryUsage, ppid, setExitCode } from "std/process";

setExitCode(exitCode());
console.log(argv().length > 0, execPath().length > 0, hrtimeNs() > 0, memoryUsage().rss > 0, ppid() > 0);
