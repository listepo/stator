// @mode: ts
// @verdict: static
// SUBSET.md: std/* imports — `std/os`, the machine and the user's account (docs/STD.md §5);
// proved by the `std_os` golden.
import { cpuCount, eol, platform } from "std/os";

console.log(platform().length > 0, cpuCount() >= 1, eol.length);
