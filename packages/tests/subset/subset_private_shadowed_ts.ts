// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Private fields
// A subclass re-declaring an ancestor's #private name: two distinct slots that share a spelling,
// which the one-name-one-slot layout cannot express yet.

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
