// @mode: ts
// @verdict: dynamic
// SUBSET.md: Object literals with optional properties (dynamic shape, docs/VALUE.md §4.10)

export const o: { x?: number; y?: number } = { x: 1 };
o.y = 5;
export const present = o.x;
export const absent = o.y;
