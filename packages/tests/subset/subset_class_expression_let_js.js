// @mode: js
// @verdict: static
// SUBSET.md: Classes -- a `let` formation nothing in the file repoints grounds a class
// expression's descriptor identity like a single `const` (plan.md §11d T12.3; it was not-yet
// under plan-notes 278). A repointed one stays not-yet: subset_class_expression_reassigned_*.

let C = class {
  m() {
    return 7;
  }
};
export const x = new C().m();
