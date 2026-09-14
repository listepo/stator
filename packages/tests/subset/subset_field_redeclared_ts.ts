// @mode: ts
// @verdict: static
// SUBSET.md: Method overriding and super.method()
// A field is a SLOT: a subclass re-declaring one shares it, with the base initializers running
// in `super(...)` and the subclass's overwriting after.

class Base {
  n: number = 1;
  read(): number {
    return this.n;
  }
}
class Derived extends Base {
  override n: number = 2;
}
export const d = new Derived().read();
