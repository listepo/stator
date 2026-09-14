// @mode: js
// @verdict: static
// SUBSET.md: Array.prototype (landed surface)
// splice(start) deletes to the END while an explicit undefined deleteCount deletes nothing --
// the lastIndexOf rule again, which is why the one-argument form has its own entry point.

export const removed = [1, 2, 3].splice(1);
