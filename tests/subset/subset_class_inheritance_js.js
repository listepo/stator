// @mode: js
// @verdict: dynamic
// @expected-fail: true
// SUBSET.md: Class inheritance, super calls, instance methods

class Base {
  m() {
    return 1;
  }
}
class Derived extends Base {
  m() {
    return super.m() + 1;
  }
}
export const d = new Derived();
