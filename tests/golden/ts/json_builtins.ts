// JSON.stringify, single-argument form: scalars (including -0, NaN, Infinity -- JSON spells the
// first "0" and the others "null"), string escaping, arrays, fixed and dynamic shapes, and class
// instances, each byte-for-byte against Node.

console.log(JSON.stringify(42));
console.log(JSON.stringify(-0));
console.log(JSON.stringify(0 / 0));
console.log(JSON.stringify(1 / 0));
console.log(JSON.stringify(1.5e300));
console.log(JSON.stringify('he"llo\\wor\nld'));
console.log(JSON.stringify('π 𝄞 ok'));
console.log(JSON.stringify(true));
console.log(JSON.stringify(null));
console.log(JSON.stringify([1, 2, 3]));
console.log(JSON.stringify([[1], [], [2, 3]]));
console.log(JSON.stringify({ a: 1, b: 'two', c: [true, false], d: { e: null } }));

const dyn: { a?: number; b?: string } = {};
dyn.a = 7;
dyn.b = 'x';
console.log(JSON.stringify(dyn));

class P {
  x: number;
  y: string;
  constructor(x: number, y: string) {
    this.x = x;
    this.y = y;
  }
}
console.log(JSON.stringify(new P(3, 'p')));
console.log(JSON.stringify(['a', '', 'c\\d']));
