// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Object literals with static keys
// A method in a literal is a member function with no class to hang it on: the shape names slots,
// and a slot holding a closure is not the same thing as a member every instance shares.

export const obj = {
  n: 1,
  twice(): number {
    return 2;
  },
};
