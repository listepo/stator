// @mode: ts
// @verdict: static
// SUBSET.md: std/* imports — `std/process` (docs/STD.md §5); proved by the `std_process` golden.
import { exit, pid } from "std/process";

console.log(pid() > 0);
exit(0);
