// @mode: ts
// @verdict: static
// SUBSET.md: Array.prototype (landed surface)

export const a: number[] = [1];
export const b: number[] = [2];
export const c: number[] = [3];
export const m = a.concat(b, c);
export const e = a.concat();
