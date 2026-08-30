// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: console
// Both the padding of an omitted optional and the choice between a method's two entry points are
// made by argument COUNT, and a spread's count is not its arity.

const xs: [number] = [1];
console.log(...xs);
