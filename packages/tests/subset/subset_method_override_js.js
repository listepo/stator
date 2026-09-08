// @mode: js
// @verdict: dynamic
// SUBSET.md: Method overriding and super.method()

class Base {
  m(v) {
    return v;
  }
}
class Derived extends Base {
  m(v) {
    return super.m(v) + 1;
  }
}
console.log(new Derived().m(1));
