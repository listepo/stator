// A user-written toString/valueOf is honored when an object becomes a string or a number
// (plan.md §9 Task 6.27, ECMA-262 §7.1.1 ToPrimitive): hint `string` (a template hole,
// `String(x)`, `concat`, `join`) tries toString first, hint `default` (`'' + x`) tries valueOf
// first, hint `number` (`Number(x)`, `<`) tries valueOf first. Class methods, object-literal
// methods and inherited methods; a throwing method is caught; an object answer is a TypeError.

class Point {
  x: number;
  y: number;
  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
  toString(): string {
    return `P(${String(this.x)},${String(this.y)})`;
  }
}

class Money {
  cents: number;
  constructor(cents: number) {
    this.cents = cents;
  }
  valueOf(): number {
    return this.cents;
  }
  toString(): string {
    return `$${(this.cents / 100).toFixed(2)}`;
  }
}

// Inherits Point's toString: the hint finds it on the base.
class Point3 extends Point {
  z: number = 0;
}

// Overrides it: a Point-typed variable holding one dispatches here.
class Labeled extends Point {
  override toString(): string {
    return `L${super.toString()}`;
  }
}

class Shy {
  valueOf(): number {
    return 7;
  }
}

class Thrower {
  toString(): string {
    throw new Error('no text');
  }
}

class Boxed {
  toString(): object {
    return {};
  }
}

const p = new Point(1, 2);
const m = new Money(1250);
const q: Point = new Labeled(3, 4);

// Hint string.
console.log(`${p}`);
console.log(String(p));
console.log('at '.concat(String(p)));
console.log([p, new Point3(5, 6), q].join(' | '));
console.log(`${m}`, String(m));
console.log(`${q}`, String(new Point3(7, 8)));
console.log(`${new Shy()}`);

// Hint default: valueOf first.
console.log('' + m);
console.log('total: ' + m);
console.log('' + new Shy());

// Hint number.
console.log(Number(m), Number(new Shy()));
console.log(m < new Money(2000), m > new Money(2000));

// Object literals.
const literal = {
  name: 'lit',
  toString(): string {
    return `literal ${this.name}`;
  },
};
console.log(`${literal}`, String(literal), '' + literal);

// An array element's own method, through join and through a template hole.
const points: Point[] = [new Point(0, 0), new Labeled(1, 1)];
console.log(`${points}`);

// A throwing method propagates as a catchable exception.
try {
  console.log(`${new Thrower()}`);
} catch (e) {
  console.log('caught:', e instanceof Error ? e.message : 'other');
}
try {
  console.log(String(new Thrower()));
} catch (e) {
  console.log('caught again:', e instanceof Error ? e.message : 'other');
}

// An object answer is a TypeError.
try {
  console.log(`${new Boxed()}`);
} catch (e) {
  console.log(e instanceof TypeError, e instanceof Error ? e.message : 'other');
}

// util.format runs them too.
console.log('%s and %s', p, literal);
console.log('%d %i %f', m, m, m);
console.log('%s', m);
console.log('%d', new Date(86400000));
