// @mode: js
// @verdict: static
// SUBSET.md: Array.prototype (landed surface)

export const xs = [1, 2, 3];
export const removed = xs.splice(1, 1, 9, 8);
export const kept = xs.splice(0, 0, 7);
