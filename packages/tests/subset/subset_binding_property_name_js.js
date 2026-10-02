// @mode: js
// @verdict: static
// SUBSET.md: Global functions

const host = { setTimeout: 1, useCaseSensitiveFileNames: true };
const { setTimeout: delay, useCaseSensitiveFileNames: caseSensitive } = host;
const { length: count } = [1, 2, 3];
export const total = delay + count;
export const flag = caseSensitive;
