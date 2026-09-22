// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Class inheritance and `super(...)`
// The js-mode twin: a `try`-guarded `super(...)` stays refused (plan.md §8 step 12(d)). The
// catch entry's super state is the SET of states at every abort-capable prefix of the body —
// re-calling re-runs the base on the post-call aborts and retries it on the pre-call ones —
// so exactly-once-per-path has no sound handler to admit.

class Base {
  constructor(n) {
    this.n = n;
  }
}
class Derived extends Base {
  constructor(n) {
    try {
      super(n);
    } catch (e) {
      super(0);
    }
  }
}
export const x = new Derived(1).n;
