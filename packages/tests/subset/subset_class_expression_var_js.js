// @mode: js
// @verdict: static
// SUBSET.md: Classes -- `var`/`let X = class { … }` that nothing in the file repoints is the
// `const` formation: the descriptor takes the variable's name and the binding holds no value.
// Rolldown spells every top-level class this way (plan.md §11d T12.3).

var P = class {
  m() {
    return 1;
  }
};
let Q = class extends P {};
console.log(new Q().m());
