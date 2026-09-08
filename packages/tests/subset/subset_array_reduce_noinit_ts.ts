// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Array.prototype (landed surface)
// Without an initial value the first element becomes the seed, and an explicit undefined initial
// is an initial -- the two forms cannot share an undefined-padded signature.

export const sum = [1, 2, 3].reduce((a: number, x: number): number => a + x);
