// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Private fields

class Base {
  #tag = 'b';
  base() {
    return this.#tag;
  }
}
class Sub extends Base {
  #tag = 's';
  sub() {
    return this.#tag;
  }
}
export const s = new Sub().sub() + new Sub().base();
