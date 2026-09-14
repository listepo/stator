// @mode: ts
// @verdict: static
// SUBSET.md: Array.prototype (landed surface)

export const xs: number[] = [1, 2, 1];
export const from = xs.lastIndexOf(1, 1);
export const whole = xs.lastIndexOf(1);
