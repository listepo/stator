// The js-mode half of `ts/class_signatures.ts` (plan-notes 233): a derived constructor that runs code
// before `super(...)`, and one that calls it in both branches of an if/else. JavaScript has no
// overload or abstract syntax, so those halves have no twin here.

const log = [];

class Shape {
  sides;
  label = `shape#${log.push('Shape field')}`;
  constructor(sides) {
    log.push('Shape ctor');
    this.sides = sides;
  }
  describe() {
    return `${this.sides} sides`;
  }
}

class Square extends Shape {
  side;
  doubled = this.sides * 2;
  constructor(side, scale) {
    const s = scale === undefined ? side : side * scale;
    log.push('Square before super');
    super(4);
    log.push('Square after super');
    this.side = s;
  }
  area() {
    return this.side * this.side;
  }
}

class Tri extends Shape {
  kind = '';
  tag = log.push('Tri field');
  constructor(equilateral) {
    if (equilateral) {
      super(3);
      this.kind = 'equilateral';
    } else {
      log.push('scalene first');
      super(3);
      this.kind = 'scalene';
    }
  }
}

const sq = new Square(3, 2);
const tri = new Tri(false);
const eq = new Tri(true);
console.log(sq);
console.log(tri);
console.log(`${eq.kind} ${sq.area()} ${sq.describe()} ${tri.describe()}`);
console.log(log.join(' | '));
