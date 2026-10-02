// @mode: ts
// @verdict: static
// SUBSET.md: Global functions

// `Array.isArray(x)` is the builtin `x instanceof Array`.
const xs: number[] = [1, 2];
const s: string = 'x';
export const a = Array.isArray(xs);
export const b = Array.isArray(s);
