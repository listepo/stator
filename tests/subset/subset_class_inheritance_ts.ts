// @mode: ts
// @verdict: static
// @expected-fail: true
// SUBSET.md: Class inheritance, super calls, instance methods

class Base {
  m(): number {
    return 1;
  }
}
class Derived extends Base {
  m(): number {
    return super.m() + 1;
  }
}
export const d = new Derived();
