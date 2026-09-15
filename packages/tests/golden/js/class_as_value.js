// A class alias (`const K = C`) binds no value: every in-place use erases to the target
// declaration, so `new K`, `K.static` and `o instanceof K` compile exactly as the direct
// spelling (plan.md §8 step 12e). Anything else -- passing, returning, printing the alias --
// stays STA1214: an opaque class value is the class object, which does not exist here.

class Point {
  static count = 0;
  constructor(x, y) {
    this.x = x;
    this.y = y;
    Point.count++;
  }
  norm() {
    return this.x * this.x + this.y * this.y;
  }
  static origin() {
    return new Point(0, 0);
  }
}

const K = Point;

// Construction through the alias, and instanceof in both spellings, including a negative.
const p = new K(3, 4);
console.log(p.x);
console.log(p.norm());
console.log(p instanceof K);
console.log(p instanceof Point);
// An array is an object with no class descriptor at all, so it matches nothing.
console.log([1, 2] instanceof K);

// Statics through the alias: a field read, a method call, and the write forms.
console.log(K.count);
console.log(K.origin());
K.count = 10;
console.log(K.count);
K.count++;
console.log(K.count);

// A static method as a value is the same binding the direct spelling reads.
const f = K.origin;
console.log(f());

// A chained alias erases through both links.
const J = K;
const q = new J(1, 2);
console.log(q instanceof K);
console.log(q instanceof J);

// An alias of a subclass keeps the chain: instanceof the base answers true.
class Dot extends Point {
  constructor(x, y) {
    super(x, y);
    this.label = 'dot';
  }
}
const DK = Dot;
const d = new DK(5, 6);
console.log(d instanceof DK);
console.log(d instanceof K);
console.log(d.label);
