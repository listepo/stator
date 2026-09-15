// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Classes -- `super.m` as a value would need a bound method object nothing builds
// (plan.md §8 step 12e). `super.m()` as a call is accepted; reading the method stays not-yet.

class B {
  m() {
    return 1;
  }
}
class D extends B {
  n() {
    const f = super.m;
    return f();
  }
}
console.log(new D().n());
