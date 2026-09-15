// @mode: ts
// @verdict: static
// SUBSET.md: Private fields
// A subclass re-declaring an ancestor's #private name: two distinct slots under per-class
// names, each body reading the slot its own class declared.

class Base {
  #tag: string = 'b';
  base(): string {
    return this.#tag;
  }
}
class Sub extends Base {
  #tag: string = 's';
  sub(): string {
    return this.#tag;
  }
}
export const s = new Sub().sub() + new Sub().base();
