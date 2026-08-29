// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Method overriding and super.method()
// A method table is one file-scope constant per class; a class declared inside a function may have
// methods that capture, and a captured environment is per evaluation of the declaration.

export function f(k: number): number {
  class Base {
    m(): number {
      return k;
    }
  }
  class Derived extends Base {
    override m(): number {
      return k + 1;
    }
  }
  return new Derived().m();
}
