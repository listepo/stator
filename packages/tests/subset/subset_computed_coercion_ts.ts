// @mode: ts
// @verdict: error
// @code: STA0012
// SUBSET.md: Object literals with static keys
// A computed key of object type is the checker's TS2464, and ts mode keeps the refusal:
// coercion is JavaScript's answer, not typed TypeScript's (plan.md §8 step 2a(b)). js mode
// coerces instead (subset_computed_coercion_js).

const k = {};
const o = { [k]: 1 };
console.log(Object.keys(o));
