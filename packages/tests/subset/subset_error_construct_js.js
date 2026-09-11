// @mode: js
// @verdict: static
// `static` since 2026-09-11, for the reason the ts twin gives: the Error interfaces are their
// runtime layout now, so nothing about an error flows through the shape table (plan.md §8 step 16,
// plan-notes 225).
// SUBSET.md: Error constructors
const e = new TypeError('bad');
console.log(e.name);
