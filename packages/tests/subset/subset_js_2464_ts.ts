// @mode: ts
// @verdict: error
// @code: STA0012
// SUBSET.md: Object literals with dynamic keys (plan.md §8 step 2a(b), TS2464)
// A computed key of object, boolean or null type is a checker refusal in ts mode. The same
// source runs in js mode (subset_js_2464_js.js), where each key coerces via ToPropertyKey.

const coerced = { [{}]: 2, [true]: 1, [null]: 3 };
console.log(coerced);
