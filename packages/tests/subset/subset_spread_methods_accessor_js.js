// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Object literals with static keys
// Spreading a methods-carrying value into a literal that writes an accessor stays not-yet:
// invoking the spread-copied getter needs step 39's dynamic spread, and the checker's
// spread result drops accessor flags, so no fixed layout can hold the pair (plan.md §8
// step 12c S-C).

const base = {
  x: 1,
  m() {
    return 7;
  },
};
export const copy = {
  ...base,
  get doubled() {
    return this.x * 2;
  },
};
