// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Array.prototype (landed surface)

export const found = [1, 2, 3].find(
  function (x) {
    return x > 1;
  },
  { k: 2 },
);
