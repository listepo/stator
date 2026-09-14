// @mode: js
// @verdict: static
// SUBSET.md: Method overriding and super.method()
// A field is a SLOT: a subclass re-declaring one shares it, with the base initializers running
// in `super(...)` and the subclass's overwriting after.

class Base {
  n = 1;
  read() {
    return this.n;
  }
}
class Derived extends Base {
  n = 2;
}
export const d = new Derived().read();
