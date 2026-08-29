// Inheritance: prefix layout, super, synthesized constructors, instanceof up the chain.

class Shape {
  sides = 0;
  label: string;
  constructor(label: string) {
    this.label = label;
  }
  describe(): string {
    return `${this.label} with ${this.sides} sides`;
  }
}

// No constructor of its own: JavaScript's implicit one forwards to the base's.
class Blob extends Shape {}

class Polygon extends Shape {
  // Reads a field the BASE constructor wrote, so it must run after super(...), not before.
  doubled = this.sides * 2;
  constructor(label: string, sides: number) {
    super(label);
    this.sides = sides;
  }
}

class Square extends Polygon {
  size: number;
  filled = true;
  constructor(size: number) {
    super('square', 4);
    this.size = size;
  }
  area(): number {
    return this.size * this.size;
  }
}

const sq = new Square(3);
const bl = new Blob('blob');
console.log(sq);
console.log(bl);
console.log(sq.describe());
console.log(bl.describe());
console.log(sq.area());
console.log(sq.doubled);

// A derived instance is readable as every ancestor: the base's fields sit at the same slots.
function describeAny(s: Shape): string {
  return s.describe();
}
console.log(describeAny(sq));
console.log(describeAny(bl));

let cur: Shape = bl;
console.log(cur.label);
cur = sq;
console.log(cur.label);
console.log(cur.sides);

const poly: Polygon = sq;
console.log(poly.doubled);

// instanceof walks the parent chain.
console.log(sq instanceof Square);
console.log(sq instanceof Polygon);
console.log(sq instanceof Shape);
console.log(bl instanceof Shape);
console.log(bl instanceof Polygon);

const shapes: Shape[] = [sq, bl];
for (const s of shapes) {
  console.log(s.describe());
}
