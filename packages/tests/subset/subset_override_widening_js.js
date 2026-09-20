// @mode: js
// @verdict: dynamic
// @expected-fail: true
// SUBSET.md: Method overriding and super.method()
// js mode's contract is that untyped code is never REJECTED, and this is untyped code: the
// checker infers `() => string` for the base and `() => number` for the override and reports the
// pair as an assignability error. Legal JavaScript, refused (plan-notes 68).

class A {
  m() {
    return 'x';
  }
}
class B extends A {
  m() {
    return 1;
  }
}
export const b = new B().m();
