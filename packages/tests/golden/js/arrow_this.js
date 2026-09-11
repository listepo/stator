// `this` inside an ARROW inside a method (plan-notes 222). An arrow has no receiver of its own, so
// the keyword reads the enclosing method's receiver parameter -- a cross-function reference, and
// one the capture analysis could not see because it collects identifiers and `this` is a keyword.
// Every reference below was an internal error ("Undefined identifier:  this") before that.
class C {
  constructor() {
    this.n = 1;
  }
  direct() {
    const f = () => this.n + 1;
    return f();
  }
  throughMap() {
    return [1, 2].map(() => this.n).join(',');
  }
  get accessor() {
    return (() => this.n)();
  }
  nested() {
    return (() => (() => this.n)())();
  }
  mix(extra) {
    const add = (v) => v + this.n;
    return add(extra);
  }
}
const c = new C();
console.log(c.direct());
console.log(c.throughMap());
console.log(c.accessor);
console.log(c.nested());
console.log(c.mix(10));
console.log(c.direct() + 10);

// Two instances do not share the captured receiver.
const d = new C();
d.n = 100;
console.log(d.direct());
console.log(c.direct());

// A closure made in a loop keeps the receiver of the method it was made in.
const readers = [];
class Box {
  constructor(v) {
    this.v = v;
  }
  make() {
    for (let i = 0; i < 2; i += 1) {
      readers.push(() => this.v + i);
    }
  }
}
new Box(7).make();
console.log(readers.map((f) => f()).join(','));
