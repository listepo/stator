// @mode: ts
// @verdict: error
// @code: STA1104
// `var` is banned outright in ts mode, so the same source stops one rung EARLIER than the
// checker's TS2403 -- the refusal is Stator's own, not a passthrough.
// SUBSET.md: var redeclaration
var value = 1;
var value = 'text';
console.log(value);
