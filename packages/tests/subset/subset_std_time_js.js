// @mode: js
// @verdict: static
// SUBSET.md: std/* imports — `std/time` (docs/STD.md §5); proved by the `std_time` golden.
import { nowMs, sleepMs } from "std/time";

sleepMs(0);
console.log(nowMs() > 0);
