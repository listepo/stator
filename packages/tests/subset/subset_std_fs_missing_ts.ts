// @mode: ts
// @verdict: error
// @code: STA0012
// SUBSET.md: std/* imports — only the named Promise twins are not-yet; any other name `std/fs`
// does not export stays the checker's "has no exported member" (docs/STD.md §2).
import { readFile } from "std/fs";

console.log(readFile);
