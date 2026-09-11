// @mode: js
// @verdict: dynamic
// SUBSET.md: delete on a dynamic-shape property (plan.md §8 step 2a(c))

/** @type {{ x?: number, y?: number }} */
export const o = { x: 1, y: 2 };
export const removed = delete o.x;
export const gone = o.x;
