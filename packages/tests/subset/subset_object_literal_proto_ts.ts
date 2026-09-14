// @mode: ts
// @verdict: dynamic
// SUBSET.md: `{ __proto__: v }` is the prototype setter, not an own property (plan.md §8 step 33)

const o = { __proto__: 1, a: 1 };
export const present = o.a;

// A computed key stays an own data property, through the same shape table.
const c = { ["__proto__"]: 4, e: 5 };
export const kept = c.e;
