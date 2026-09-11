// @mode: ts
// @verdict: dynamic
// SUBSET.md: delete on a dynamic-shape property (plan.md §8 step 2a(c))

export const o: { x?: number; y?: number } = { x: 1, y: 2 };
export const removed = delete o.x;
export const gone = o.x;
