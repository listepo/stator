// `std/process` (docs/STD.md §5): the process id, and `exit`, which ends the program at once —
// the line after it never prints, on either side. A non-integer or out-of-range code is refused
// before anything exits. A non-zero code and `abort` cannot be a golden (the runner demands exit
// 0); unit/std.test.ts proves those against the built binary.
import { exit, pid } from "std/process";

const id = pid();
console.log(id === Math.floor(id), id > 0, id === pid());

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
