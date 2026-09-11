// @mode: ts
// @verdict: static
// `static`, and it became static on 2026-09-11: the `error-new` node was always fully typed
// (errorHType, checked by STA4095), but TypeScript types every error as its structural `Error`
// interface, which the HType mapping did not model -- so the value flowed through the dynamic
// representation and this row said `dynamic`. The five standard interfaces now map to the same
// layout their constructors produce (plan.md §8 step 16, plan-notes 225), which is what the old
// comment predicted would happen ("modelling the interface would make it static", plan-notes 195).
// SUBSET.md: Error constructors
const e = new TypeError('bad');
console.log(e.name);
