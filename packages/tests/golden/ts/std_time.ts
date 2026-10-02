// `std/time` (docs/STD.md §5): the wall clock in integer milliseconds, and a sync sleep that
// blocks the only thread. Clock values never print — only properties of them — so the output is
// the same on every run and on both sides.
import { nowMs, sleepMs } from "std/time";

const t0 = nowMs();
console.log(t0 === Math.floor(t0), t0 > 1.7e12);
sleepMs(0);
sleepMs(30);
const t1 = nowMs();
console.log(t1 - t0 >= 30, t1 - t0 < 10000);

for (const ms of [-1, NaN, 2147483648]) {
  try {
    sleepMs(ms);
    console.log(`sleepMs(${ms}): no throw`);
  } catch (e) {
    if (e instanceof Error) {
      console.log(e.message);
    }
  }
}
