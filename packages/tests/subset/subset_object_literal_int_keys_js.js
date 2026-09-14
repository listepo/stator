// @mode: js
// @verdict: static
// SUBSET.md: Object literals with static keys
// Integer-like string keys stay in the fixed layout (plan.md §8 step 28): the gate verdict is
// static, and the integer-first order is a runtime enumeration fact the golden pins.

export const obj = { b: 1, "10": 2, "2": 3, a: 4 };
export const ks = Object.keys(obj);
