// @mode: ts
// @verdict: dynamic
// SUBSET.md: Object literals with dynamic keys, index signatures

const key: string = "prop";
export const obj: { [k: string]: number } = { [key]: 42 };
