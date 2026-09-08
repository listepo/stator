// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: String.prototype (landed surface)
// A method exists only as a callee: there is no function value to bind, the same rule a
// collection method follows.

export const f = "abc".trim;
