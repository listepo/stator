// @mode: js
// @verdict: dynamic
// SUBSET.md: Spread operator ... in array literals
// Spreading an unknown value drains it through the `...` row's iterator protocol at run time
// (plan.md §11c T11.4 step 5; docs/VALUE.md §4.23).

const u = JSON.parse('[1, 2]');
export const a = [...u];
console.log(a);
