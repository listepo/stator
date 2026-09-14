// @mode: ts
// @verdict: static
// SUBSET.md: Object literals with static keys
// A spread of any fixed-shape expression -- a call result, a member access -- names its keys
// in that shape, so the result is a fixed slot list the emitter fills from one evaluation
// (plan.md §8 step 12c residue).

function make(): { x: number; y: number } {
  return { x: 1, y: 2 };
}
const wrap: { inner: { x: number; y: number } } = { inner: { x: 5, y: 6 } };
export const fromCall = { ...make(), z: 3 };
export const fromMember = { ...wrap.inner, w: 7 };
