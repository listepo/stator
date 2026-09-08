// Inheritance on the dynamic path: fields are declared by assignment in the constructor and every
// field type is unknown, but the layout, the super call and instanceof are the same ones.

class Counter {
  constructor(start) {
    this.count = start;
    this.name = 'counter';
  }
  report() {
    return `${this.name}: ${this.count}`;
  }
}

class Stepped extends Counter {
  constructor(start, step) {
    super(start);
    this.name = 'stepped';
    this.step = step;
  }
  next() {
    return this.count + this.step;
  }
}

class Plain extends Stepped {}

const s = new Stepped(1, 2);
console.log(s);
console.log(s.report());
console.log(s.next());
console.log(s instanceof Stepped);
console.log(s instanceof Counter);

const p = new Plain(10, 5);
console.log(p.report());
console.log(p.next());
console.log(p instanceof Counter);

// A base-typed reference reads the base fields at the same slots.
const c = s;
console.log(c.count);
console.log(c.report());
