// @mode: js
// @verdict: dynamic
// SUBSET.md: Object namespace
// entries produces [string, T] pairs, and the HIR has no tuple type: the element is honestly
// Unknown, which is what the dynamic verdict reports.

export const es = Object.entries({ x: 1, y: 2 });
