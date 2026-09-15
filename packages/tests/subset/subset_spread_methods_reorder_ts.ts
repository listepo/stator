// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Object literals with static keys
// A copied method body reads `this` through the SOURCE's slot layout, so the result must
// preserve the source's slots. TypeScript orders a spread result's members last-group-first,
// so an appended own key shifts them: spreading the methods-carrying value last (`{ z: 0,
// ...base }`) lands, this spelling stays not-yet (plan.md §8 step 12c S-C).

const base = {
  x: 1,
  m(): number {
    return 7;
  },
};
export const copy = { ...base, z: 2 };
