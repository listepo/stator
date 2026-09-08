// @mode: ts
// @verdict: static
// SUBSET.md: Array.prototype (landed surface)
// Callback-taking methods call back into compiled code through jsrt_call, the same closure ABI
// every compiled call site uses.

export const doubled = [1, 2, 3].map((x: number): number => x * 2);
export const evens = [1, 2, 3, 4].filter((x: number): boolean => x % 2 === 0);
