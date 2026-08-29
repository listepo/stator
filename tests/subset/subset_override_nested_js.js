// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Method overriding and super.method()

export function f(k) {
  class Base {
    m() {
      return k;
    }
  }
  class Derived extends Base {
    m() {
      return k + 1;
    }
  }
  return new Derived().m();
}
