// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: std/* imports — `std/thread` and `std/sync` need T10.2's OS threads (docs/STD.md
// §5), so they are not-yet naming Phase 10 rather than unknown.
import { spawn } from "std/thread";

console.log(spawn);
