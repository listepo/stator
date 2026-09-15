// @mode: ts
// @verdict: error
// @code: STA1003
// SUBSET.md: Spread operator ... in array literals / Object literals with static keys
// In ts mode an unannotated `JSON.parse` result is implicit any (STA1003, never) — the mode's
// own refusal, which outranks the js-mode not-yet for the same spread (plan.md §8 step 39).

const u = JSON.parse('[1, 2]');
export const a = [...u];
const o = JSON.parse('{"x": 1}');
export const b = { ...o };
console.log(a);
console.log(b);
