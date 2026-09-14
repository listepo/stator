// @mode: js
// @verdict: static
// SUBSET.md: Object literals with static keys
// Inferred fixed shapes spread on the static path: the call runs once, fields copy in order
// (plan.md §8 step 12c residue).

function make() {
  return { x: 1, y: 2 };
}
const wrap = { inner: { x: 5, y: 6 } };
export const fromCall = { ...make(), z: 3 };
export const fromMember = { ...wrap.inner, w: 7 };
