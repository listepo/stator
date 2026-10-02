// @mode: ts
// @verdict: static
// SUBSET.md: Global functions

// `typeof` of a global the language defines folds to its string: the feature test reads no
// value at all.
export const hasJson = typeof JSON !== 'undefined';
export const math = typeof Math;
export const fn = typeof parseInt;
