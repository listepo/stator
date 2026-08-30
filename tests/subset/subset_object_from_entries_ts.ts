// @mode: ts
// @verdict: dynamic
// SUBSET.md: Object namespace
// fromEntries BUILDS a dynamic shape, so its result is Unknown and every read of it is a
// boundary -- the same honest answer JSON.parse gives.

const pairs: string[][] = [['a', '1']];
export const built: unknown = Object.fromEntries(pairs);
