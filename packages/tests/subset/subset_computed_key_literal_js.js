// @mode: js
// @verdict: static
// SUBSET.md: Object literals with static keys
// A computed key with a literal type IS a static key: `k` has type `"dyn"`, so `[k]` is the
// name `dyn` -- the same key the direct spelling writes -- and the literal takes the fixed
// path (plan.md §8 step 22).

const k = "dyn";
export const o = { [k]: 1 };
console.log(o.dyn);
