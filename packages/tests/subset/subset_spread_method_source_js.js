// @mode: js
// @verdict: static
// SUBSET.md: Object literals with static keys
// A method on an object literal IS an own enumerable property, so spreading copies it as
// data: the lowering expands one bound-closure read per method into the result's hidden
// slot, and a later `copy.m()` passes the copy as the receiver (plan.md §8 step 12c S-C).

const base = {
  x: 1,
  m() {
    return 7;
  },
};
export const copy = { ...base };
