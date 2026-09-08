// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Method overriding and super.method()
// A field is a SLOT: a subclass re-declaring one is two declarations of the same slot, whose
// initializers would race for it in an order the layout does not express.

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
