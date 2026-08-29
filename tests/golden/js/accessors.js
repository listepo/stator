// Accessors on the dynamic path. The property is still a pair of member functions and still no
// slot, so nothing about the layout changes when the types go away.

class Cell {
  constructor(start) {
    this.raw = start;
    this.writes = 0;
  }

  get value() {
    return this.raw;
  }

  set value(v) {
    this.raw = v;
    this.writes = this.writes + 1;
  }

  get report() {
    return `${this.value} after ${this.writes}`;
  }
}

const c = new Cell('a');
console.log(c.value);
console.log(c.report);

c.value = 'b';
c.value = 3;
console.log(c.value);
console.log(c.report);
console.log(c);

// A setter's parameter is untyped, so it takes whatever it is handed -- the same value that a
// field slot would have held, boxed the same way.
class Sink {
  constructor() {
    this.last = undefined;
  }
  set take(v) {
    this.last = v;
  }
  get took() {
    return this.last;
  }
}
const s = new Sink();
console.log(s.took);
s.take = 42;
console.log(s.took);
s.take = 'x';
console.log(s.took);
console.log(s);
