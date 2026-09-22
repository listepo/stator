// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Class inheritance and `super(...)`
// The js-mode twin: a `case` that falls through into another `super(...)` call re-runs the
// base constructor on the falling path (Node: `ReferenceError: Super constructor may only be
// called once`), so the switch rule refuses the chain (plan.md §8 step 12(d)). js mode
// leaves fall-through to the program (`noFallthroughCasesInSwitch` is off), so here the gate
// is the only refusal.

class Base {
  constructor(n) {
    this.n = n;
  }
}
class Derived extends Base {
  constructor(x) {
    switch (x) {
      case 1:
        super(1);
      case 2:
        super(2);
        break;
      default:
        super(3);
    }
  }
}
export const x = new Derived(1).n;
