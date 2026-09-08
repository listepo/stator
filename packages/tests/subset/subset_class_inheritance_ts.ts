// @mode: ts
// @verdict: static
// SUBSET.md: Class inheritance, super calls, instance methods

class Base {
  n: number;
  constructor(n: number) {
    this.n = n;
  }
  m(): number {
    return this.n + 1;
  }
}
class Derived extends Base {
  doubled = this.n * 2;
  constructor(n: number) {
    super(n);
  }
}
class Implicit extends Derived {}

const d: Base = new Implicit(1);
console.log(d.m());
