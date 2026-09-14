// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Generics — a generic class has one descriptor per tuple, so its bare name
// identifies nothing to compare against.

class Box<T> {
  value: T;
  constructor(v: T) {
    this.value = v;
  }
}
const b = new Box<number>(1);
console.log(b instanceof Box);
