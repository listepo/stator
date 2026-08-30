// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: JSON.parse
// A reviver runs user code at every node of the result, which the parser does not do.

export const v: unknown = JSON.parse('{"x":1}', (_k: string, value: unknown) => value);
