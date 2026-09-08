// @mode: js
// @verdict: dynamic
// SUBSET.md: Class inheritance, super calls, instance methods

class Base {
  constructor(n) {
    this.n = n;
  }
  m() {
    return this.n + 1;
  }
}
class Derived extends Base {
  constructor(n) {
    super(n);
    this.doubled = this.n * 2;
  }
}
class Implicit extends Derived {}

const d = new Implicit(1);
console.log(d.m());
