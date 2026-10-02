// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Object literals with static keys
// A literal `null` operand gives the literal a fixed type (`{}`), so it is not dynamic and the
// shape-table fold cannot take it, although the fold itself skips `null` (an untyped operand
// compiles: subset_spread_unknown_object_js.js, plan-notes 297). An array spread beside an own
// key is the same refusal: the own key drops the checker's index signature. A bare or
// multi-array spread keeps its index and compiles (subset_spread_array_no_shape_js.js).
// Stays not-yet (plan.md §8 step 12c residue).

export const b = { ...null };
const arr = [1, 2];
export const c = { ...arr, x: 9 };
