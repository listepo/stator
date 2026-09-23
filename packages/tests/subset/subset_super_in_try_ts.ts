// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Class inheritance and `super(...)`
// A `try`-guarded `super(...)` stays refused (plan.md §8 step 12(d)): a `try` body can abort
// after the call as well as before it, so a handler that re-calls RE-RUNS the base on one
// path (Node: `ReferenceError: Super constructor may only be called once`) and retries a
// FAILED call on the other (legal — `this` stays unbound until the call returns). Exactly
// once per path cannot be enforced while abort points are every checked call.

class Base {
  n: number;
  constructor(n: number) {
    this.n = n;
  }
}
class Derived extends Base {
  constructor(n: number) {
    try {
      super(n);
    } catch (e) {
      super(0);
    }
  }
}
export const x = new Derived(1).n;
