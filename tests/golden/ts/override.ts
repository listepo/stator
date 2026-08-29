// Method overriding: one name, one slot, a different entry per class. What makes this observable
// rather than a compile-time choice is a BASE-typed reference holding a subclass instance.

class Shape {
  name: string;
  constructor(name: string) {
    this.name = name;
  }
  area(): number {
    return 0;
  }
  // Calls an overridden method from a base's body: the receiver decides, not the writer.
  report(): string {
    return `${this.name}=${this.area()}`;
  }
}

class Square extends Shape {
  side: number;
  constructor(side: number) {
    super('square');
    this.side = side;
  }
  override area(): number {
    return this.side * this.side;
  }
}

// Two levels: `super.area()` skips this class's override and runs the one it replaced.
class Cube extends Square {
  override area(): number {
    return super.area() * 6;
  }
  override report(): string {
    return `cube(${super.report()})`;
  }
}

// A leaf that overrides nothing still answers through the table its ancestors need.
class Unit extends Square {
  constructor() {
    super(1);
  }
}

const shapes: Shape[] = [new Shape('flat'), new Square(3), new Cube(2), new Unit()];
for (const s of shapes) {
  console.log(s.area());
}
for (const s of shapes) {
  console.log(s.report());
}

// The static type is what resolves the SLOT; the dynamic type is what fills it.
const sq: Square = new Cube(3);
console.log(sq.area());
console.log(sq.report());
console.log(sq.side);

// A method nothing overrides keeps its direct call, and the two kinds compose in one expression.
class Counter {
  total: number = 0;
  add(n: number): number {
    this.total += n;
    return this.total;
  }
}
class Doubling extends Counter {
  override add(n: number): number {
    return super.add(n * 2);
  }
}
const c: Counter = new Doubling();
console.log(c.add(1));
console.log(c.add(2));
console.log(c.total);
console.log(c instanceof Doubling);
console.log(c);
