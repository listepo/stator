// @mode: ts
// @verdict: not-yet
// @code: STA1210
// SUBSET.md: Date
// Every LOCAL-time member is slice B: its answer depends on the host time zone, which is a
// property of the environment the binary runs in rather than of the program. Slice B lands them
// behind the golden runner's TZ pin, which is what makes them provable at all.
const d = new Date(0);
console.log(d.getFullYear());
