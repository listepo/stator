// @mode: ts
// @verdict: dynamic
// SUBSET.md: Object literals with static keys
// Spread of an array without a fixed shape enumerates indices then named extras at run
// time through the shape table, copied onto a dynamic result -- so the construct is dynamic,
// not static (plan.md §8 step 12c array-spread residue). Only literals the shape table owns
// compile: a bare or multi-array spread keeps its index signature, while an own key beside
// it drops the index and stays not-yet (subset_spread_dynamic_ts.ts pins that half).

const arr: number[] = [1, 2];
export const o = { ...arr };
const strs: string[] = ["s"];
export const twice = { ...arr, ...strs };
