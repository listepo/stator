// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Array.prototype (landed surface)
// splice(start) deletes to the END while an explicit undefined deleteCount deletes nothing --
// the lastIndexOf rule again -- and the insertion form is variadic.

export const removed = [1, 2, 3].splice(1);
