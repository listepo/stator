// @mode: ts
// @verdict: static
// SUBSET.md: Array.prototype (landed surface)

export const xs: number[] = [3, 1, 4];
export const n = xs.push(9);
export const i = xs.indexOf(1);
export const s = xs.join("-");
export const t = xs.slice(1);
export const c = xs.concat([7]);
