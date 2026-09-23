// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Class inheritance and `super(...)`
// A `case` that falls through into another `super(...)` call re-runs the base constructor on
// the falling path — Node answers `ReferenceError: Super constructor may only be called
// once` — so the switch rule refuses the chain (plan.md §8 step 12(d)). In ts mode the
// checker also reports the fall-through (`noFallthroughCasesInSwitch`); the gate's not-yet
// outranks that error in the verdict precedence, which is why the twin reads the same
// verdict.

class Base {
  n: number;
  constructor(n: number) {
    this.n = n;
  }
}
class Derived extends Base {
  constructor(x: number) {
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
