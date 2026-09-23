// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Class inheritance and `super(...)`
// A `return` completes the construction (`new` yields the receiver), so a path that returns
// before `super(...)` completes with `this` unbound — Node answers `ReferenceError: Must call
// super constructor in derived class before accessing 'this' or returning from derived
// constructor`, which this runtime does not raise. The rule refuses rather than compile a
// program that silently answers differently (plan.md §8 step 12(d)); the same holds for a
// `return` buried in a loop or block before the call.

class Base {
  n: number;
  constructor(n: number) {
    this.n = n;
  }
}
class Derived extends Base {
  constructor(x: number) {
    if (x > 0) {
      return;
    }
    super(x);
  }
}
export const x = new Derived(-1).n;
