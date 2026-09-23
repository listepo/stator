// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Class inheritance and `super(...)`
// The js-mode twin: a `return` completes the construction with `this` unbound — Node answers
// `ReferenceError` where the compiled constructor would return an instance — so a returning
// path before `super(...)` stays refused (plan.md §8 step 12(d)).

class Base {
  constructor(n) {
    this.n = n;
  }
}
class Derived extends Base {
  constructor(x) {
    if (x > 0) {
      return;
    }
    super(x);
  }
}
export const x = new Derived(-1).n;
