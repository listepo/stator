// @mode: js
// @verdict: dynamic
// SUBSET.md: Object literals with dynamic keys (plan.md §8 step 2a(b), TS2464)
// The same source ts mode refuses: each key coerces via ToPropertyKey at run time, so the
// literal takes the dynamic path and js mode never rejects it.

const coerced = { [{}]: 2, [true]: 1, [null]: 3 };
console.log(coerced);
