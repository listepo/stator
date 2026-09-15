// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Spread operator ... in array literals
// Spreading an unknown value needs GetIterator dispatch for a value with no static element
// type — the Phase 5 iterator surface (plan.md §8 step 39), not the dynamic tier.

const u = JSON.parse('[1, 2]');
export const a = [...u];
console.log(a);
