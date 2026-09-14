// @mode: js
// @verdict: static
// SUBSET.md: Object literals with static keys

// `key` has the literal type `"prop"`, so `[key]` is the static name `prop` -- the same key
// the direct spelling writes -- and the literal takes the fixed path (plan.md §8 step 22).
// Only a key of non-literal type (a `string`-typed binding, a parameter) is dynamic.

const key = "prop";
export const obj = { [key]: 42 };
