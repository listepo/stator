// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Object literals with static keys
// An untyped value has no static key set to expand -- and not even a runtime one, where
// `null` must be skipped and primitives boxed by an entry point nothing implements. An
// array spread beside an own key joins them here: the own key drops the checker's index
// signature, so the literal is not dynamic and the shape-table fold cannot take it. A bare
// or multi-array spread keeps its index and compiles (subset_spread_array_no_shape_js.js).
// Stays not-yet (plan.md §8 step 12c residue).

const u = JSON.parse('{"a":1}');
export const a = { ...u };
export const b = { ...null };
function f(x) {
  return { ...x };
}
export const applied = f({ x: 1 });
const arr = [1, 2];
export const c = { ...arr, x: 9 };
