// @mode: ts
// @verdict: static
// SUBSET.md: Method overriding and super.method()

class Base {
  m(): number {
    return 1;
  }
}
class Derived extends Base {
  override m(): number {
    return super.m() + 1;
  }
}
console.log(new Derived().m());
