// @mode: ts
// @verdict: static
// SUBSET.md: Object literals with static keys
// A spread of a variable with a fixed shape names its keys in that shape, so the result is a fixed
// slot list too: the lowering expands it into one read per field (plan.md §8 step 12 family c).

const base = { x: 1 };
export const obj = { ...base, y: 2 };
