// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Class inheritance and `super(...)`
// A `switch` without `default` has an uncovered path — no case matches, no body runs — so a
// super-carrying switch without one never certifies coverage and the constructor stays
// refused (plan.md §8 step 12(d)). An empty `default` covers its path with nothing and is
// refused the same way.

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
        break;
      case 2:
        super(2);
        break;
    }
  }
}
export const x = new Derived(1).n;
