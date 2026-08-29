// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Method overriding and super.method()

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
