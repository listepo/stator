// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Object literals with static keys
// Spreading a value with no fixed shape -- an optional property or an index signature --
// has no static key set to expand. Stays not-yet (plan.md §8 step 12c residue). An array
// spread beside an own key joins them here: the own key drops the checker's index signature,
// so the literal is not dynamic and the shape-table fold cannot take it. A bare or
// multi-array spread keeps its index and compiles (subset_spread_array_no_shape_ts.ts).

const maybe: { x?: number } = { x: 1 };
export const a = { ...maybe };
const dict: { [k: string]: number } = { x: 1 };
export const b = { ...dict };
const arr: number[] = [1, 2];
export const c = { ...arr, x: 9 };
