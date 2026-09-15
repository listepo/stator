// @mode: js
// @verdict: static
// SUBSET.md: Private fields
// A subclass re-declaring an ancestor's #private name: two distinct slots under per-class
// names, each body reading the slot its own class declared.

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
