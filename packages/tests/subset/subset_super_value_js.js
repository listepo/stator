// @mode: js
// @verdict: static
// SUBSET.md: Method overriding and super.method() -- `super.m` as a value is the base's
// method as an unbound closure (plan.md §8 step 42). `super.m()` as a call was already accepted.

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
