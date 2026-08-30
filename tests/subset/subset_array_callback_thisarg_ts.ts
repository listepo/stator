// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Array.prototype (landed surface)
// The thisArg form is deferred: none of the landed callback methods lower with it.

export const doubled = [1, 2, 3].map(
  function (this: { k: number }, x: number): number {
    return x * this.k;
  },
  { k: 2 },
);
