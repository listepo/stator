// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Object literals with static keys
// A spread copies a shape this literal does not name, so the key set is not written here.

const base = { x: 1 };
export const obj = { ...base, y: 2 };
