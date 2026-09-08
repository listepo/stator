// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: JSON.stringify
// The replacer/space forms change the whole output shape and stay deferred with parse.

export const s = JSON.stringify({ x: 1 }, null, 2);
