// plan.md §8 step 25: `this` in an arrow inside a class field initializer. The initializer
// runs inside the constructor, so the arrow captures the constructor's receiver — a capture the
// analysis could not see, because no non-arrow function stands between the keyword and the
// module scope (compile-time `STA4072 Undefined identifier:  this` where Node prints `1`).
class Counter {
  n = 0;
  inc = (): number => {
    this.n += 1;
    return this.n;
  };
  nested = (): () => number => () => this.n;
  plain = (): number => 42;
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
  v: number = 1;
  constructor() {
    this.v = 5;
  }
  get = (): number => this.v * 2;
}
console.log(new Explicit().get());
