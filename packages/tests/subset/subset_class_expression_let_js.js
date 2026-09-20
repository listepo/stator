// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Classes -- only a single-`const` formation grounds a class expression's
// descriptor identity; a `let` can be repointed, so erasing its uses would compile a
// different program (plan.md §8 step 12(d), plan-notes 278).

let C = class {
  m() {
    return 7;
  }
};
export const x = new C().m();
