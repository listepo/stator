// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: std/* imports — the Promise twins of `std/fs` (`readTextAsync`, …) wait for T10.2's
// thread pool, so they are not-yet naming Phase 10 rather than a missing export (docs/STD.md §2).
import { writeTextAsync } from "std/fs";

async function main() {
  await writeTextAsync("/tmp/stator-subset-never-written.txt", "x");
}

main();
