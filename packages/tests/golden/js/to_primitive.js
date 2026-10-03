// A user-written toString/valueOf is honored when an object becomes a string or a number
// (plan.md §9 Task 6.27, ECMA-262 §7.1.1 ToPrimitive), in js mode: the runtime asks the object
// for the method by name. Class methods, object-literal methods, inherited methods and a
// constructor function's prototype; a throwing method is caught; an object answer is a TypeError.

class Point {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }
  toString() {
    return `P(${this.x},${this.y})`;
  }
}

class Point3 extends Point {
  constructor(x, y, z) {
    super(x, y);
    this.z = z;
  }
}

class Money {
  constructor(cents) {
    this.cents = cents;
  }
  valueOf() {
    return this.cents;
  }
  toString() {
    return `$${(this.cents / 100).toFixed(2)}`;
  }
}

function Temp(degrees) {
  this.degrees = degrees;
}
Temp.prototype.toString = function () {
  return `${this.degrees}C`;
};
Temp.prototype.valueOf = function () {
  return this.degrees;
};

// `any`: the checker refuses arithmetic on an object type it can see (STA0012, out of scope
// here), so the operators below meet values only the run describes.
/** @returns {any} */
function make(kind) {
  if (kind === 'point') return new Point(1, 2);
  if (kind === 'money') return new Money(1250);
  if (kind === 'temp') return new Temp(21);
  return { toString: () => 'arrow' };
}

const values = [make('point'), make('money'), make('temp'), make('other'), new Point3(4, 5, 6)];

// Hint string: a template hole, String(), concat, join.
for (const v of values) {
  console.log(`${v}`, String(v), ''.concat(v));
}
console.log(values.join(' / '));
console.log(String(values));

// Hint default: valueOf first.
for (const v of values) {
  console.log('' + v, v + '!');
}

// Hint number: Number(), unary +, the numeric operators and comparisons, ++.
const money = make('money');
const temp = make('temp');
console.log(Number(money), +temp, -temp, money - temp, money * 2, money % 7, ~temp);
console.log(money > temp, temp < money, money == 1250, temp != 21);
let counter = make('temp');
counter++;
console.log(counter);
let compound = make('money');
compound -= 50;
console.log(compound);
console.log(Math.max(money, temp), parseInt(temp), isNaN(money));

// A Date answers its time value for a number, its text for a string.
const day = new Date(86400000);
console.log(Number(day), +day, `${day}` === String(day));

// Literal objects, including one whose method lives in a field.
const literal = {
  name: 'lit',
  toString() {
    return `literal ${this.name}`;
  },
  valueOf() {
    return 42;
  },
};
console.log(`${literal}`, '' + literal, Number(literal) * 2, -literal);

// A non-callable method is skipped: the next rung answers.
const skipped = { toString: 5, valueOf: () => 'from valueOf' };
console.log(`${skipped}`);

// A throwing method propagates as a catchable exception, before the right operand converts.
/** @type {any} */
const thrower = {
  toString() {
    throw new Error('no text');
  },
  valueOf() {
    throw new Error('no number');
  },
};
/** @type {any} */
const loud = {
  valueOf() {
    console.log('loud valueOf ran');
    return 1;
  },
};
try {
  console.log(`${thrower}`);
} catch (e) {
  console.log('caught:', e.message);
}
try {
  console.log(thrower - loud);
} catch (e) {
  console.log('caught:', e.message);
}
try {
  console.log('' + thrower + loud);
} catch (e) {
  console.log('caught:', e.message);
}
try {
  console.log([1, thrower, 3].join());
} catch (e) {
  console.log('caught:', e.message);
}

// Both methods answer objects: a TypeError.
/** @type {any} */
const boxed = { toString: () => ({}), valueOf: () => [] };
try {
  console.log(String(boxed));
} catch (e) {
  console.log(e instanceof TypeError, e.message);
}
try {
  console.log(boxed < 1);
} catch (e) {
  console.log(e instanceof TypeError, e.message);
}

// util.format runs them too.
console.log('%s | %s | %s', make('point'), make('money'), literal);
console.log('%d %i %f', money, temp, literal);
console.log('%d', day);
