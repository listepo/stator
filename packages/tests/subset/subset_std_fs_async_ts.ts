// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: std/* imports — the Promise twins of `std/fs` (`readTextAsync`, …) wait for T10.2's
// thread pool, so they are not-yet naming Phase 10 rather than a missing export (docs/STD.md §2).
import { readTextAsync } from "std/fs";

async function main(): Promise<void> {
  console.log(await readTextAsync("/etc/hosts"));
}

void main();
