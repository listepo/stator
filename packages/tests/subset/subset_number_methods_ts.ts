// @mode: ts
// @verdict: static
// SUBSET.md: Number methods

// `Number.prototype.toString(radix)` and `toFixed(digits)`, and the two `Number` statics that are
// the global functions themselves, and the constants, which fold to literals.
const n: number = 255;
export const hex: string = n.toString(16);
export const dec: string = n.toString();
export const fixed: string = (n / 7).toFixed(3);
export const i: number = Number.parseInt('ff', 16);
export const f: number = Number.parseFloat('2.5');
export const big: number = Number.MAX_SAFE_INTEGER;
