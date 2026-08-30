// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: JSON.parse

export const v = JSON.parse('{"x":1}', (k, value) => value);
