// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Class inheritance and `super(...)`
// The js-mode twin: a `switch` without `default` has an uncovered path (no case matches, no
// body runs), so a super-carrying switch without one never certifies coverage (plan.md §8
// step 12(d)).

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
        break;
      case 2:
        super(2);
        break;
    }
  }
}
export const x = new Derived(1).n;
