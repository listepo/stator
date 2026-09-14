// The js-mode twin of `ts/class_field_arrow_this.ts` (plan.md §8 step 25): `this` in an
// arrow inside a class field initializer reads the constructor's receiver through the
// constructor's environment.
class Counter {
  n = 0;
  inc = () => {
    this.n += 1;
    return this.n;
  };
  nested = () => () => this.n;
  plain = () => 42;
}
const c = new Counter();
console.log(c.inc());
console.log(c.nested()());
console.log(c.plain());

// Two instances do not share the captured receiver.
const d = new Counter();
d.n = 100;
console.log(d.inc());
console.log(c.inc());

// An explicit constructor carries the receiver the same way.
class Explicit {
  v = 1;
  constructor() {
    this.v = 5;
  }
  get = () => this.v * 2;
}
console.log(new Explicit().get());
