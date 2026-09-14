// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Object literals with static keys
// A method on an object literal IS an own enumerable property, so spreading must copy it as
// data -- which the field-only expansion cannot do without silently dropping a key. Stays
// not-yet (plan.md §8 step 12c residue).

const base = {
  x: 1,
  m(): number {
    return 7;
  },
};
export const copy = { ...base };
