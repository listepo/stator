// Classes with a fixed shape: fields in slots, one constructor, instance methods shared by every
// instance. The print half is as much of the contract as the storage half -- the class NAME is
// inside `util.inspect`'s 80-column budget, an object never groups its fields into columns the way
// an array groups its elements, and past the depth cap an object prints as `[ClassName]`.

class Point {
  x: number;
  y: number;
  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
  norm(): number {
    return this.x * this.x + this.y * this.y;
  }
  scaled(k: number): Point {
    return new Point(this.x * k, this.y * k);
  }
  shift(dx: number): void {
    this.x += dx;
    this.y++;
  }
}

const p = new Point(3, 4);
console.log(p);
console.log(p.x);
console.log(p.norm());

// A method returning a new instance: `this` inside it is the receiver, and the object it builds is
// a separate allocation with its own slots.
const q = p.scaled(2);
console.log(q);
console.log(p);

// Writes through `this`, including the compound and update forms, which read the slot and write it
// back. `p` is const; the BINDING is what cannot be reassigned, not the object's fields.
p.shift(10);
console.log(p);

// The same three write forms from outside the class.
p.x = 0;
p.y += 5;
p.x--;
console.log(p);

// A field initializer runs before the constructor body, in declaration order. This class has no
// constructor of its own, so the initializers are the whole of it.
class Counter {
  n = 0;
  label = 'hits';
  bump(): void {
    this.n = this.n + 1;
  }
  describe(): string {
    return `${this.label}: ${this.n}`;
  }
}

const c = new Counter();
console.log(c);
c.bump();
c.bump();
console.log(c);
console.log(c.describe());

// A class with no fields at all prints as `Name {}`, not `{}`.
class Nothing {
  answer(): number {
    return 42;
  }
}
console.log(new Nothing());
console.log(new Nothing().answer());

// Objects nest in both directions, and an object inside an array is inspected, not stringified.
class Pair {
  a: Point;
  b: Point;
  constructor(a: Point, b: Point) {
    this.a = a;
    this.b = b;
  }
}
console.log(new Pair(new Point(1, 2), new Point(3, 4)));
console.log([new Point(1, 2), new Point(3, 4)]);

// The depth cap is 2, counted from the top: the fourth level prints as `[Deep]`.
class Deep {
  v: Deep | number;
  constructor(v: Deep | number) {
    this.v = v;
  }
}
console.log(new Deep(new Deep(new Deep(new Deep(1)))));

// The class name counts toward the 80-column budget. These two hold the same field; only the name
// differs, and the long one must break where the short one does not.
class S {
  v: string;
  constructor(v: string) {
    this.v = v;
  }
}
class AVeryLongClassNameIndeed {
  v: string;
  constructor(v: string) {
    this.v = v;
  }
}
const payload = '0123456789012345678901234567890123456789012345678901234567';
console.log(new S(payload));
console.log(new AVeryLongClassNameIndeed(payload));

// A declared field that nothing assigns holds `undefined` -- the slot exists either way, which is
// why the key still prints.
class Partial {
  set: number;
  unset: number | undefined;
  constructor() {
    this.set = 1;
  }
}
console.log(new Partial());

// A class instance is not a string: `${o}` and string concatenation run ToString, which is
// `[object Object]`, and that is a different operation from what console.log does.
console.log(`${p}`);
console.log(`${[p, 1]}`);

// A field can hold an array, and an array element can be an object, without either changing shape.
class Bag {
  items: number[];
  constructor(items: number[]) {
    this.items = items;
  }
  total(): number {
    let sum = 0;
    for (const item of this.items) {
      sum += item;
    }
    return sum;
  }
}
const bag = new Bag([1, 2, 3, 4]);
console.log(bag);
console.log(bag.total());
bag.items[0] = 100;
console.log(bag.items[0]);
console.log(bag.total());

// Eight fields are eight lines: an object never groups into columns, where eight array elements
// would. This is the difference the print corpus pins, seen from the compiler side.
class Wide {
  f0 = 0;
  f1 = 1;
  f2 = 2;
  f3 = 3;
  f4 = 4;
  f5 = 5;
  f6 = 6;
  f7 = 7;
}
console.log(new Wide());

// A method calling another method on the same receiver, and one calling a free function.
function twice(n: number): number {
  return n * 2;
}

class Chain {
  base: number;
  constructor(base: number) {
    this.base = base;
  }
  doubled(): number {
    return twice(this.base);
  }
  quadrupled(): number {
    return twice(this.doubled());
  }
}
console.log(new Chain(5).quadrupled());

// Two classes with identical fields are still two classes -- the name is part of the identity and
// of the printed form.
class Metres {
  v: number;
  constructor(v: number) {
    this.v = v;
  }
}
class Feet {
  v: number;
  constructor(v: number) {
    this.v = v;
  }
}
console.log(new Metres(1));
console.log(new Feet(1));

// `instanceof` against a class NAME. There is one class descriptor per class in the whole program,
// so the test is descriptor identity -- and while `extends` is deferred, identity is the entire
// prototype chain. Two classes with the same shape are still two classes, which is the same
// nominal fact the printed form shows.
const metres = new Metres(1);
console.log(metres instanceof Metres);
console.log(metres instanceof Feet);
console.log(new Feet(1) instanceof Feet);
console.log(new Point(1, 2) instanceof Point);

// An array is an object with no class descriptor at all, so it matches nothing.
console.log([1, 2] instanceof Point);
console.log(bag.items instanceof Bag);

// The result is a boolean like any other: it narrows a condition, negates, and prints.
if (metres instanceof Metres) {
  console.log('narrowed to Metres');
}
console.log(!(metres instanceof Feet));
console.log(`${metres instanceof Metres}`);
