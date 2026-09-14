// Fixed-shape objects enumerate integer-like keys first, ascending, ahead of named keys
// (ECMA-262 OrdinaryOwnPropertyKeys; plan.md §8 step 28) -- in reflection, JSON and inspect
// alike. The dynamic path already partitioned; this pins the fixed literal and class instance.

const o = { b: 1, "10": 2, "2": 3, a: 4 };
console.log(Object.keys(o));
console.log(Object.values(o));
console.log(Object.entries(o));
console.log(Object.getOwnPropertyNames(o));
console.log(JSON.stringify(o));
console.log(o);
for (const k in o) {
  console.log(k);
}

// "01" is not a canonical index (leading zero), so it stays with the named keys in insertion
// position while "1" floats first.
const mixed = { "01": 1, "1": 2, z: 3 };
console.log(Object.keys(mixed));
console.log(JSON.stringify(mixed));
console.log(mixed);

// A class instance has identifier fields only, so the partition is a no-op and declaration
// order survives -- the regression half of this fixture.
class Point {
  x: number;
  y: number;
  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
}
const pt = new Point(3, 4);
console.log(Object.keys(pt));
console.log(Object.values(pt));
console.log(Object.entries(pt));
console.log(JSON.stringify(pt));
console.log(pt);
