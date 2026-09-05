// @mode: ts
// @verdict: dynamic
// `dynamic`, not `static`, and the reason is the BINDING rather than the construction: the
// `error-new` node is fully typed (errorHType, checked by STA4095), but TypeScript types every
// error as its structural `Error` interface, which the HType mapping does not model, so the
// value flows through the dynamic representation. Correct either way -- the golden proves the
// answers match Node -- and modelling the interface would make it static (plan-notes 195).
// SUBSET.md: Error constructors
const e = new TypeError('bad');
console.log(e.name);
