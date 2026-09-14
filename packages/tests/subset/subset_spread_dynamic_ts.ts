// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Object literals with static keys
// Spreading a value with no fixed shape -- an optional property, an index signature, an
// array -- has no static key set to expand. Stays not-yet (plan.md §8 step 12c residue).

const maybe: { x?: number } = { x: 1 };
export const a = { ...maybe };
const dict: { [k: string]: number } = { x: 1 };
export const b = { ...dict };
const arr: number[] = [1, 2];
export const c = { ...arr };
