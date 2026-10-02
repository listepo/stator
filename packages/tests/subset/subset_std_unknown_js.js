// @mode: js
// @verdict: error
// @code: STA3002
// SUBSET.md: std/* imports — `std/` is a reserved prefix, so a name that is not a std module is
// a hard error, never a fall-through to a package lookup (docs/STD.md §1).
import { foo } from "std/foo";

console.log(foo);
