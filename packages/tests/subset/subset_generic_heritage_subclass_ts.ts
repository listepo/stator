// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Generics — a generic subclass of a generic base would need its base
// re-grounded per tuple (`Sub<string>` descends from `Box<string>`, `Sub<number>` from
// `Box<number>`); only a non-generic subclass naming one complete tuple compiles today.

class Box<T> {
  v: T;
  constructor(x: T) {
    this.v = x;
  }
}
class Sub<T> extends Box<T> {
  constructor(x: T) {
    super(x);
  }
}
console.log(new Sub<number>(1).v);
