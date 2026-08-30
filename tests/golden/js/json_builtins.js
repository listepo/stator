// JSON.stringify in js mode: same surface as the ts fixture, with the JSDoc annotation putting
// the optional-property literal on the dynamic-shape path.

console.log(JSON.stringify(42));
console.log(JSON.stringify(-0));
console.log(JSON.stringify(0 / 0));
console.log(JSON.stringify(1 / 0));
console.log(JSON.stringify('he"llo\\wor\nld'));
console.log(JSON.stringify(true));
console.log(JSON.stringify(null));
console.log(JSON.stringify([1, 2, 3]));
console.log(JSON.stringify({ a: 1, b: 'two', c: [true, false], d: { e: null } }));

/** @type {{ a?: number, b?: string }} */
const dyn = {};
dyn.a = 7;
dyn.b = 'x';
console.log(JSON.stringify(dyn));
